type ParameterModel = {
  getParameterCount(): number;
  getParameterIndex(id: string): number;
  getParameterDefaultValue(index: number): number;
  getParameterValueByIndex(index: number): number;
  setParameterValueByIndex(index: number, value: number): void;
};

const faceIds = ["ParamMouthForm", "ParamCheek", "ParamEyeLSmile", "ParamEyeRSmile", "ParamBrowLY", "ParamBrowRY", "ParamAngleZ"] as const;
// Small face-only changes leave the hands and legs in the model's default standing pose.
const facePoses = [
  [0, 0, 0, 0, 0, 0, 0],
  [.2, .12, .08, .08, 0, 0, 0],
  [0, 0, 0, 0, .12, .12, -1.5],
  [.12, .22, .14, .14, .06, .06, 1.5],
  [-.08, 0, 0, 0, -.08, -.08, 1],
  [.24, .08, .04, .04, .1, .1, -1],
] as const;

// Hanabi's hair and ribbons are physics outputs. These are the model's
// upstream head/body inputs, so a small continuous sway lets its own physics
// move the loose parts while the hands and legs stay in a standing pose.
const swayIds = ["Param169", "Param252", "Param253", "ParamBodyAngleX2", "ParamBodyAngleY2", "ParamBodyAngleZ2"] as const;
const swayOffsets = (seconds: number) => [
  Math.sin(seconds * 0.83) * 2.2 + Math.sin(seconds * 0.37 + 0.6) * 0.55,
  Math.sin(seconds * 0.62 + 1.1) * 1.1,
  Math.sin(seconds * 0.71 + 2.2) * 1.8,
  Math.sin(seconds * 0.78 + 0.9) * 2.6,
  Math.sin(seconds * 0.53 + 1.7) * 1.25,
  Math.sin(seconds * 0.66 + 2.6) * 2.1,
];

const ease = (progress: number) => {
  const t = Math.max(0, Math.min(1, progress));
  return t * t * (3 - 2 * t);
};

export class RestPoseController {
  private active = false;
  private settleFrom: number[] | null = null;
  private settleAt = 0;
  private faceFrom: number[] | null = null;
  private faceAt = 0;
  private faceIndex = 0;
  private nextFaceAt = 0;
  private readonly defaults: number[];
  private readonly faceIndices: number[];
  private readonly swayIndices: number[];
  private readonly model: ParameterModel;
  private readonly random: () => number;

  constructor(model: ParameterModel, random = Math.random) {
    this.model = model;
    this.random = random;
    this.defaults = Array.from({ length: model.getParameterCount() }, (_, index) => model.getParameterDefaultValue(index));
    this.faceIndices = faceIds.map(id => model.getParameterIndex(id));
    this.swayIndices = swayIds.map(id => model.getParameterIndex(id));
  }

  interrupt() {
    this.active = false;
    this.settleFrom = null;
    this.faceFrom = null;
  }

  varyFace(now: number) {
    if (this.active && !this.settleFrom) this.nextFaceAt = now;
  }

  settle(now: number) {
    this.active = true;
    this.settleAt = now;
    this.settleFrom = this.defaults.map((_, index) => this.model.getParameterValueByIndex(index));
    this.faceFrom = null;
    this.faceIndex = 0;
    this.nextFaceAt = now + 3000;
  }

  update(now: number, faceEnabled: boolean, swayEnabled = false) {
    if (!this.active) return;
    const sway = swayEnabled ? swayOffsets(now / 1000) : [];
    const swayTargets = new Map(this.swayIndices.map((index, position) => [index, sway[position] ?? 0]));
    if (this.settleFrom) {
      const amount = ease((now - this.settleAt) / 850);
      this.defaults.forEach((target, index) => {
        const restingTarget = target + (swayTargets.get(index) ?? 0);
        this.model.setParameterValueByIndex(index, this.settleFrom![index] + (restingTarget - this.settleFrom![index]) * amount);
      });
      if (amount === 1) this.settleFrom = null;
      return;
    }
    if (swayEnabled) this.swayIndices.forEach((index, position) => {
      if (index >= 0 && index < this.defaults.length) this.model.setParameterValueByIndex(index, this.defaults[index] + sway[position]);
    });
    if (!faceEnabled) return;
    if (!this.faceFrom && now >= this.nextFaceAt) {
      this.faceIndex = (this.faceIndex + 1 + Math.floor(this.random() * (facePoses.length - 1))) % facePoses.length;
      this.faceFrom = this.faceIndices.map(index => index >= 0 && index < this.defaults.length ? this.model.getParameterValueByIndex(index) : 0);
      this.faceAt = now;
    }
    if (!this.faceFrom) return;
    const amount = ease((now - this.faceAt) / 750);
    facePoses[this.faceIndex].forEach((offset, position) => {
      const index = this.faceIndices[position];
      if (index < 0 || index >= this.defaults.length) return;
      const target = this.defaults[index] + offset;
      this.model.setParameterValueByIndex(index, this.faceFrom![position] + (target - this.faceFrom![position]) * amount);
    });
    if (amount === 1) {
      this.faceFrom = null;
      this.nextFaceAt = now + 5500 + this.random() * 4500;
    }
  }
}
