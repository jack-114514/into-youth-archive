type Bounds = { left: number; top: number; width: number; height: number };

// Distance controls the amount of movement; avoid snapping to a unit direction
// as Live2DModel.focus() does, which also discards the configured strength.
export function pointerFocus(x: number, y: number, bounds: Bounds, viewport: { width: number; height: number }, strength: number) {
  const dx = (x - bounds.left - bounds.width / 2) / Math.max(bounds.width * 2, viewport.width * .4, 1);
  const dy = (bounds.top + bounds.height * .2 - y) / Math.max(bounds.height * 2, viewport.height * .4, 1);
  const gain = Math.max(0, Math.min(1, strength)) / Math.sqrt(1 + dx * dx + dy * dy);
  return { x: dx * gain, y: dy * gain };
}

type ParameterModel = {
  getParameterCount(): number;
  getParameterIndex(id: string): number;
  getParameterMinimumValue(index: number): number;
  getParameterMaximumValue(index: number): number;
  getParameterValueByIndex(index: number): number;
  setParameterValueByIndex(index: number, value: number): void;
};

// Hanabi's generic angles are physics OUTPUTS. Feed the real head/body INPUTS
// after the resting pose, before Cubism evaluates hair/ribbon/head physics.
export class HanabiFollowController {
  private readonly inputs;
  private readonly model: ParameterModel;
  constructor(model: ParameterModel) {
    this.model = model;
    this.inputs = ['Param169', 'Param252', 'Param253', 'ParamBodyAngleX2', 'ParamBodyAngleY2', 'ParamBodyAngleZ2'].map(id => {
      const index = model.getParameterIndex(id);
      return index >= 0 && index < model.getParameterCount()
        ? { index, min: model.getParameterMinimumValue(index), max: model.getParameterMaximumValue(index) } : null;
    });
  }
  apply(x: number, y: number) {
    const offsets = [x * 24, y * 20, -x * y * 8, x * 6, y * 3, -x * y * 4];
    this.inputs.forEach((input, position) => {
      if (!input) return;
      const value = this.model.getParameterValueByIndex(input.index) + offsets[position];
      this.model.setParameterValueByIndex(input.index, Math.max(input.min, Math.min(input.max, value)));
    });
  }
}
