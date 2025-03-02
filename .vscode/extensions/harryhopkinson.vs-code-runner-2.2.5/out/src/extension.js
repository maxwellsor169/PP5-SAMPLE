"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = require("vscode");
const main_1 = require("./main");
function activate(context) {
    vscode.window.onDidCloseTerminal(() => {
        (0, main_1.OnDidCloseTerminal)();
    });
    const run = vscode.commands.registerCommand("code-runner.run", (fileUri) => {
        (0, main_1.Run)(null, fileUri);
    });
    const runCustomCommand = vscode.commands.registerCommand("code-runner.runCustomCommand", () => {
        (0, main_1.RunCustomCommand)();
    });
    const runByLanguage = vscode.commands.registerCommand("code-runner.runByLanguage", () => {
        (0, main_1.RunByLanguage)();
    });
    const stop = vscode.commands.registerCommand("code-runner.stop", () => {
        (0, main_1.Stop)();
    });
    context.subscriptions.push(run);
    context.subscriptions.push(runCustomCommand);
    context.subscriptions.push(runByLanguage);
    context.subscriptions.push(stop);
}
function deactivate() {
    (0, main_1.Dispose)();
}
//# sourceMappingURL=extension.js.map