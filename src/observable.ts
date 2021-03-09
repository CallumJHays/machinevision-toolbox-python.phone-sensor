import { useState, useEffect } from "react";

type Callback<T> = (state: T) => void;

// something neat I came up with - similar to https://github.com/pmndrs/valtio
export class Observable<T> {
  state: T;
  callbacks: Callback<T>[];
  private boundSet: Callback<T>;

  constructor(init: T, onChange: Callback<T> | null = null) {
    this.state = init;
    this.callbacks = onChange ? [onChange] : [];
    this.boundSet = this.set.bind(this);
  }

  // register with react lifecycle
  useState(): [T, (state: T) => void] {
    const [state, setState] = useState<T>(this.state); // eslint-disable-line

    // this would usually be in the useEffect below, but for compatability with the
    // component lifecycle we need this to be called here
    if (this.callbacks.indexOf(setState) === -1) {
      this.onChange(setState);
    }

    // eslint-disable-next-line
    useEffect(() => {
      return () => this.deRegister(setState);
    }, []);

    return [state, this.boundSet];
  }

  onChange(cb: Callback<T>) {
    this.callbacks.push(cb);
  }

  deRegister(cb: Callback<T>) {
    this.callbacks.splice(this.callbacks.indexOf(cb), 1);
  }

  set(state: T) {
    this.state = state;
    for (const cb of this.callbacks) {
      cb(state);
    }
  }
}
