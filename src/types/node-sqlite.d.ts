declare module 'node:sqlite' {
  // Minimal typing surface used by this repo. Expand only if you use
  // additional APIs from node:sqlite elsewhere.
  export class DatabaseSync {
    constructor(filename: string, options?: { readOnly?: boolean } | undefined);
    prepare(sql: string): {
      all(...args: any[]): any[];
      get(...args: any[]): any | undefined;
      run(...args: any[]): any;
    };
    close(): void;
  }

  export { DatabaseSync };
}
