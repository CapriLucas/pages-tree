import type { NextConfig } from "next";
import type { WebpackConfigContext } from "next/dist/server/config-shared";
import path from "path";
import fs from "fs";

interface PagesTreePluginOptions {
  outputPath?: string;
  format?: "json" | "js";
}

export function withPagesTree(
  pluginOptions: PagesTreePluginOptions = {}
): (config: NextConfig) => NextConfig {
  return (nextConfig: NextConfig) => {
    return {
      ...nextConfig,
      webpack(config: any, options: WebpackConfigContext) {
        // Ensure we run only on server builds
        if (!options.isServer) {
          return config;
        }

        // Add our custom plugin to generate routes at build time
        config.plugins.push(
          new PagesTreeWebpackPlugin({
            dir: options.dir,
            config: nextConfig,
            ...pluginOptions,
          })
        );

        // Call the original webpack config if it exists
        if (typeof nextConfig.webpack === "function") {
          return nextConfig.webpack(config, options);
        }

        return config;
      },
    };
  };
}

class PagesTreeWebpackPlugin {
  private dir: string;
  private outputPath: string;
  private format: "json" | "js";

  constructor(options: {
    dir: string;
    config: NextConfig;
    outputPath?: string;
    format?: "json" | "js";
  }) {
    this.dir = options.dir;
    this.outputPath = options.outputPath || ".next/static/pages-tree";
    this.format = options.format || "json";
  }

  apply(compiler: any) {
    // Run after the Next.js manifest generation
    compiler.hooks.afterEmit.tapPromise("PagesTreePlugin", async () => {
      try {
        // Get the manifests that Next.js generated
        const appDir = path.join(this.dir, "app");
        const pagesDir = path.join(this.dir, "pages");
        const nextDir = path.join(this.dir, ".next");

        const routes = await this.collectRoutes(appDir, pagesDir, nextDir);
        await this.writeRoutes(routes);
        await this.generateApiRoute(routes);
      } catch (error) {
        console.error("Error in PagesTreePlugin:", error);
      }
    });
  }

  private async collectRoutes(
    appDir: string,
    pagesDir: string,
    nextDir: string
  ) {
    const routes = {
      pages: [] as string[],
      appPages: [] as string[],
      appRoutes: [] as string[],
    };

    try {
      // Try to read Next.js manifests
      const appPathsManifestPath = path.join(
        nextDir,
        "app-path-routes-manifest.json"
      );
      const appRoutesManifestPath = path.join(
        nextDir,
        "app-build-manifest.json"
      );
      const pagesManifestPath = path.join(
        nextDir,
        "server/pages-manifest.json"
      );

      if (fs.existsSync(appPathsManifestPath)) {
        console.debug("PINt 1");

        const appPathsManifest = require(appPathsManifestPath);
        routes.appPages = Object.keys(appPathsManifest);
      }

      if (fs.existsSync(appRoutesManifestPath)) {
        console.debug("PINt 2");

        const appRoutesManifest = require(appRoutesManifestPath);
        // Filter for API routes
        routes.appRoutes = Object.keys(appRoutesManifest).filter((route) =>
          route.startsWith("/api/")
        );
      }

      if (fs.existsSync(pagesManifestPath)) {
        const pagesManifest = require(pagesManifestPath);
        routes.pages = Object.keys(pagesManifest);
      }
      console.log("Routes", routes);
    } catch (error) {
      console.warn("Error reading Next.js manifests:", error);
    }

    return routes;
  }

  private async writeRoutes(routes: any) {
    const outputDir = path.join(this.dir, this.outputPath);
    fs.mkdirSync(outputDir, { recursive: true });

    if (this.format === "json") {
      fs.writeFileSync(
        path.join(outputDir, "routes.json"),
        JSON.stringify(routes, null, 2)
      );
    } else {
      const content = `
        export const routes = ${JSON.stringify(routes, null, 2)}
        export default routes
      `;
      fs.writeFileSync(path.join(outputDir, "routes.js"), content);
    }
  }

  private async generateApiRoute(routes: any) {
    const apiDir = path.join(this.dir, "app", "pages-tree");
    fs.mkdirSync(apiDir, { recursive: true });

    const apiContent = `
      export async function GET() {
        const routes = ${JSON.stringify(routes, null, 2)}
        
        return new Response(JSON.stringify(routes), {
          headers: {
            'content-type': 'application/json',
            'cache-control': 'public, s-maxage=3600'
          }
        })
      }
    `;

    fs.writeFileSync(path.join(apiDir, "route.ts"), apiContent);
  }
}
