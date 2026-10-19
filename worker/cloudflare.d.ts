declare module 'cloudflare:workers' {
  export const env: {
    HYPERDRIVE: { connectionString: string };
  };
}

declare module 'cloudflare:node' {
  export function httpServerHandler(options: { port: number }): {
    fetch(request: Request): Promise<Response>;
  };
}
