/// <reference types="react-scripts" />

declare module "quaternion" {
  export = class Quaternion {
    x: number;
    y: number;
    z: number;
    w: number;

    static fromEuler(
      alpha: float,
      beta: float,
      gamma: float,
      order: str = "ZXY"
    ): Quaternion;
  };
}
