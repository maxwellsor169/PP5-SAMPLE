import terser from "@rollup/plugin-terser";

export default {
	input: "server.js",
	plugins: [
		terser({
			ecma: 2020,
			module: false,
		}),
	],
	output: {
		dir: "build",
		format: "cjs",
	},
	preserveEntrySignatures: "strict",
};
