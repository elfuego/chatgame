const path = require("path");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const devMode = process.env.NODE_ENV !== "production";

module.exports = {
  // target: "node",
  mode: devMode ? "development" : "production",
  entry: {
    scripts: "./src/js/scripts.js",
    styles: "./src/scss/styles.scss",
  },
  output: {
    filename: devMode ? "[name].js" : "[name].[hash].js",
    path: devMode ? path.resolve(__dirname, "./build") : path.resolve(__dirname, "./dist"),
  },
  devServer: {
    static: "./build",
    open: {
      app: {
        // or 'google-chrome', match with package.json
        name: "Google Chrome",
      },
    },
    port: 3000,
    // hot: true,
    watchFiles: {
      paths: ["src/js/**/*.*", "src/scss/**/*.*"],
      //☝🏽 Enables live reload in these folders
      options: {
        usePolling: true,
      },
    },
  },
  module: {
    rules: [
      {
        // Component styles: imported as a string (`?inline`) and injected into the shadow DOM
        test: /\.scss$/i,
        resourceQuery: /inline/,
        use: [
          { loader: "css-loader", options: { exportType: "string" } },
          { loader: "sass-loader", options: { api: "modern" } },
        ],
      },
      {
        test: /\.scss$/i,
        resourceQuery: { not: [/inline/] },
        use: [
          devMode ? "style-loader" : MiniCssExtractPlugin.loader,
          "css-loader",
          {
            loader: "sass-loader",
            options: {
              api: "modern",
            },
          },
        ],
      },
      {
        test: /\.html$/i,
        use: ["html-loader"],
      },
      {
        test: /\.ya?ml$/i,
        type: "asset/source",
      },
    ],
  },
  plugins: [
    new MiniCssExtractPlugin({
      filename: devMode ? "[name].css" : "[name].[hash].css",
    }),
    new HtmlWebpackPlugin({
      template: "./src/index.html",
    }),
  ],
};
