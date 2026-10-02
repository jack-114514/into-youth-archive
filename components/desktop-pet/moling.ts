export const molingPoses = ["float", "blink", "look", "sleep", "wave", "jump", "turn", "cast", "thinking", "shy", "surprised", "complete"] as const;
export type MolingPose = typeof molingPoses[number];
// Body bounds measured in each unchanged 362px sprite cell. Align the body,
// not the effects/tail, so changing a pose never teleports the character.
const bodyBounds = [[153,154,280,295],[143,156,271,295],[119,158,240,295],[104,157,231,300],
  [147,105,294,247],[134,105,296,252],[121,111,252,260],[107,108,238,257],
  [155,74,290,222],[150,76,284,217],[111,75,257,219],[112,74,259,219]];
export function molingPoseGeometry(pose: MolingPose) {
  const index = molingPoses.indexOf(pose);
  const [left, top, right, bottom] = bodyBounds[index];
  const scale = 142 / (bottom - top);
  return { x: index % 4 * 100 / 3, y: Math.floor(index / 4) * 50, scale,
    translateX: (181 - (left + right) / 2 * scale) / 362 * 100,
    translateY: (190 - (top + bottom) / 2 * scale) / 362 * 100 };
}
export function molingGesture(pose: MolingPose, elapsed: number) {
  const t = Math.max(0, elapsed);
  const envelope = Math.sin(Math.PI * Math.min(1, t / 1800));
  return { y: pose === "jump" && t < 700 ? -24 * Math.sin(Math.PI * t / 700) : 0,
    rotation: pose === "wave" ? 3 * Math.sin(t / 95) * envelope : pose === "thinking" ? -2 : pose === "shy" ? 2 : 0,
    scale: pose === "cast" ? 1 + .035 * envelope : 1 };
}
export const molingLabels: Record<MolingPose, string> = {
  float: "漂浮", blink: "眨眼", look: "张望", sleep: "打盹", wave: "挥手", jump: "跳跃",
  turn: "转身", cast: "青玉光点", thinking: "思考", shy: "害羞", surprised: "惊讶", complete: "完成",
};
export type MolingCue = { id: number; action?: string; emotion?: string; pose?: MolingPose; randomMotion?: boolean };

// Discrete poses are artwork, not animation frames. Movement is supplied by CSS.
export class MolingAnimation {
  pose: MolingPose = "float";
  private end = 0;
  private lastId = -1;
  private idleStart = 0;
  private randomIndex = 0;
  cue(cue: MolingCue, now: number) {
    if (cue.id === this.lastId || cue.randomMotion && now < this.end || !cue.pose && cue.action === "wave" && this.pose === "wave" && now < this.end) return false;
    this.lastId = cue.id;
    const action: Record<string, MolingPose> = { wave: "wave", nod: "cast", thinking: "thinking", sleep: "sleep" };
    const random: MolingPose[] = ["look", "jump", "turn", "cast", "sleep"];
    this.pose = cue.pose || (cue.randomMotion ? random[this.randomIndex++ % random.length] : action[cue.action || ""] || "float");
    this.end = this.pose === "thinking" && cue.action === "thinking" ? Infinity : now + (this.pose === "blink" ? 160 : this.pose === "sleep" ? 3200 : 1800);
    return true;
  }
  update(now: number, idle: boolean) {
    if (now < this.end) return this.pose;
    if (this.end) { this.end = 0; this.idleStart = now; }
    const phase = Math.max(0, now - this.idleStart) % 12000;
    this.pose = !idle ? "float" : phase >= 4200 && phase < 4380 ? "blink" : phase >= 9000 && phase < 10800 ? "look" : "float";
    return this.pose;
  }
  reset(now: number) { this.pose = "float"; this.end = 0; this.idleStart = now; }
}
