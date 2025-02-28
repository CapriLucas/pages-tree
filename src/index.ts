import type { NextConfig } from "next";
import type { WebpackConfigContext } from "next/dist/server/config-shared";
import path from "path";
import fs from "fs";

interface PagesTreePluginOptions {
  outputPath?: string;
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

  constructor(options: {
    dir: string;
    config: NextConfig;
    outputPath?: string;
  }) {
    this.dir = options.dir;
    this.outputPath = options.outputPath || ".next/static/pages-tree";
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
          await this.writeHTMLFile(routes);
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
        const data = Object.keys(appRoutesManifest).filter(
          (route) => !route.startsWith("/api/")
        );
        routes.appRoutes = data.sort();

        console.log(`📝 Pages Tree: Found ${routes.appRoutes.length} routes`);
      }
    } catch (error) {
      console.error("❌ Pages Tree: Error reading manifests:", error);
    }

    return routes;
  }

  private async writeHTMLFile(routes: { appRoutes: string[] }) {
    try {
      // Write to the static directory so it's accessible via /_next/static/
      const staticDir = path.join(this.dir, ".next", "static");
      const outputDir = path.join(staticDir, "pages-tree");
      fs.mkdirSync(outputDir, { recursive: true });

      const outputPath = path.join(outputDir, "index.html");

      // Generate HTML content
      const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Pages Tree</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            line-height: 1.6;
            max-width: 800px;
            margin: 0 auto;
            padding: 2rem;
            background: #f5f5f5;
        }
        .container {
            background: white;
            padding: 2rem;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        h1 {
            color: #333;
            margin-top: 0;
            border-bottom: 2px solid #eaeaea;
            padding-bottom: 0.5rem;
        }
        .routes {
            list-style: none;
            padding: 0;
            margin: 0;
        }
        .route {
            padding: 0.5rem;
            margin: 0.5rem 0;
            background: #f8f9fa;
            border-radius: 4px;
            border-left: 3px solid #007bff;
        }
        .route:hover {
            background: #e9ecef;
        }
        .route a {
            color: #007bff;
            text-decoration: none;
            display: block;
        }
        .route a:hover {
            color: #0056b3;
        }
        .info {
            margin-top: 2rem;
            padding-top: 1rem;
            border-top: 1px solid #eaeaea;
            color: #666;
            font-size: 0.9rem;
        }
        .count {
            background: #007bff;
            color: white;
            padding: 0.2rem 0.6rem;
            border-radius: 12px;
            font-size: 0.8rem;
            margin-left: 0.5rem;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Pages Tree <span class="count">${
          routes.appRoutes.length
        }</span></h1>
        <ul class="routes">
            ${routes.appRoutes
              .map(
                (route) => `
                <li class="route">
                    <a href="${route}" target="_blank">${route}</a>
                </li>`
              )
              .join("")}
        </ul>
        <div class="info">
            Generated on ${new Date().toLocaleString()}
        </div>
    </div>
</body>
</html>
      `;

      fs.writeFileSync(outputPath, html);

      console.log(`💾 Pages Tree: Wrote HTML to ${outputPath}`);
      console.log(
        `🌍 Access your routes at: /_next/static/pages-tree/index.html`
      );
    } catch (error) {
      console.error("❌ Pages Tree: Error writing HTML file:", error);
    }
  }
}
