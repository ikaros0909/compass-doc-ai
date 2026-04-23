/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Electron 패키지에 .next/standalone 만 동봉하면 되도록 standalone 산출.
  output: "standalone",
  serverExternalPackages: ["better-sqlite3", "@opendataloader/pdf", "pdfjs-dist"],
  // standalone 트레이서는 .js/.json 만 추적해서 JAR/.node 같은 비코드 자산을
  // 누락한다. 아래 패턴들로 강제 포함시킨다.
  outputFileTracingIncludes: {
    "/api/**/*": [
      "./node_modules/@opendataloader/pdf/**/*",
      "./node_modules/better-sqlite3/build/Release/*.node",
      "./node_modules/pdfjs-dist/**/*",
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "500mb",
    },
  },
};

export default nextConfig;
