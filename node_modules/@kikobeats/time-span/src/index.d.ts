declare const timeSpan: {
  <T = number>(options?: { format?: (milliseconds: number) => T }): (start?: bigint) => () => T;
};

export = timeSpan;
