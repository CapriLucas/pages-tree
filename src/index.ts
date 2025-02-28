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
    // This ensures we run after Next.js has finished everything
    compiler.hooks.done.tapPromise("PagesTreePlugin", async () => {
      try {
        // Add a small delay to ensure all files are written
        await new Promise((resolve) => setTimeout(resolve, 1000));

        const nextDir = path.join(this.dir, ".next");

        const routes = await this.collectRoutes(nextDir);

        // Only proceed if we found routes
        if (routes.appRoutes.length > 0) {
          await this.writeRoutes(routes);
          await this.generateApiRoute(routes);
          console.log("✅ Pages Tree: Generated routes successfully");
        } else {
          console.warn("⚠️ Pages Tree: No routes found in manifests");
        }
      } catch (error) {
        console.error("❌ Pages Tree Error:", error);
      }
    });
  }

  private async collectRoutes(nextDir: string) {
    const routes = {
      appRoutes: [] as string[],
    };

    try {
      console.log("📁 Pages Tree: Checking manifest...");
      const appRoutesManifestPath = path.join(
        nextDir,
        "server/app-paths-manifest.json"
      );

      if (fs.existsSync(appRoutesManifestPath)) {
        console.log("📖 Pages Tree: Reading app routes manifest");
        const content = fs.readFileSync(appRoutesManifestPath, "utf8");
        const appRoutesManifest = JSON.parse(content);
        const data = Object.keys(appRoutesManifest)
          .filter((route) => !route.startsWith("/api/"))
          .filter((route) => !route.startsWith("/pages-tree"));
        routes.appRoutes = data;

        console.log(
          `📝 Pages Tree: Found ${routes.appRoutes.length} API routes`
        );
      }
    } catch (error) {
      console.error("❌ Pages Tree: Error reading manifests:", error);
    }

    return routes;
  }

  private async writeRoutes(routes: any) {
    try {
      const outputDir = path.join(this.dir, this.outputPath);
      fs.mkdirSync(outputDir, { recursive: true });

      const outputPath = path.join(outputDir, `routes.${this.format}`);

      if (this.format === "json") {
        fs.writeFileSync(outputPath, JSON.stringify(routes, null, 2));
      } else {
        const content = `
          export const routes = ${JSON.stringify(routes, null, 2)};
          export default routes;
        `;
        fs.writeFileSync(outputPath, content);
      }

      console.log(`💾 Pages Tree: Wrote routes to ${outputPath}`);
    } catch (error) {
      console.error("❌ Pages Tree: Error writing routes:", error);
    }
  }

  private async generateApiRoute(routes: any) {
    try {
      const apiDir = path.join(this.dir, "app", "pages-tree");
      fs.mkdirSync(apiDir, { recursive: true });

      const apiContent = `
  import { promises as fs } from 'fs';
  import path from 'path';
  
  export const dynamic = 'force-dynamic';
  
  export async function GET() {
    try {
      const routesPath = path.join(process.cwd(), '${this.outputPath}/routes.${
        this.format
      }');
      
      if (await fs.stat(routesPath).catch(() => false)) {
        ${
          this.format === "json"
            ? 'const routes = JSON.parse(await fs.readFile(routesPath, "utf8"));'
            : "const { default: routes } = await import(routesPath);"
        }
        
        return Response.json(routes);
      }
      
      return Response.json({
        appRoutes: []
      });
    } catch (error) {
      console.error('Pages Tree API Error:', error);
      return Response.json({ error: 'Failed to read routes' }, { status: 500 });
    }
  }
  `;

      const apiPath = path.join(apiDir, "route.ts");
      fs.writeFileSync(apiPath, apiContent);
      console.log(`📝 Pages Tree: Generated API route at ${apiPath}`);
    } catch (error) {
      console.error("❌ Pages Tree: Error generating API route:", error);
    }
  }
}
