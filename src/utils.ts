type Class<T> = new (...args: any[]) => T;

export function as<T>(cls: Class<T>, obj: T | any): T {
  if (obj instanceof cls) {
    return obj;
  } else {
    throw new Error(`Expected object ${obj} to be an instance of ${cls}`);
  }
}
