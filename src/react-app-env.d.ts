/// <reference types="react-scripts" />

// experimental API available only in newer browser versions
declare class ResizeObserver {
  constructor(callback: () => void);

  observe(el: HTMLElement): void;
}

declare module "quaternion" {
  export = class Quaternion {
    static fromEuler(
      alpha: float,
      beta: float,
      gamma: float,
      order: str = "ZXY"
    ): Quaternion;
  };
}
