"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OnDidCloseTerminal = OnDidCloseTerminal;
exports.Run = Run;
exports.RunCustomCommand = RunCustomCommand;
exports.RunByLanguage = RunByLanguage;
exports.Stop = Stop;
exports.Dispose = Dispose;
const fs = require("fs");
const micromatch = require("micromatch");
const os = require("os");
const path_1 = require("path");
const vscode = require("vscode");
const constants_1 = require("./constants");
const util_1 = require("./util");
const TmpDir = os.tmpdir();
let outputChannel = vscode.window.createOutputChannel("Code");
let terminal = null;
let isRunning = false;
let process;
let codeFile;
let isTmpFile;
let languageId;
let cwd;
let runFromExplorer;
let document;
let workspaceFolder;
let config;
let TERMINAL_DEFAULT_SHELL_WINDOWS = null;
function OnDidCloseTerminal() {
    terminal = null;
}
function Run() {
    return __awaiter(this, arguments, void 0, function* (languageIdParam = null, fileUri = null) {
        if (isRunning) {
            vscode.window.showInformationMessage("Code is already running!");
            return;
        }
        runFromExplorer = CheckIsRunFromExplorer(fileUri);
        if (runFromExplorer) {
            document = yield vscode.workspace.openTextDocument(fileUri);
        }
        else {
            const editor = vscode.window.activeTextEditor;
            if (editor) {
                document = editor.document;
            }
            else {
                vscode.window.showInformationMessage("No code found or selected.");
                return;
            }
        }
        Initialize();
        const fileExtension = (0, path_1.extname)(document.fileName);
        const executor = GetExecutor(languageIdParam, fileExtension);
        if (executor == null) {
            vscode.window.showInformationMessage("Code language not supported or defined.");
            return;
        }
        GetCodeFileAndExecute(fileExtension, executor);
    });
}
function RunCustomCommand() {
    if (isRunning) {
        vscode.window.showInformationMessage("Code is already running!");
        return;
    }
    runFromExplorer = false;
    const editor = vscode.window.activeTextEditor;
    if (editor) {
        document = editor.document;
    }
    Initialize();
    const executor = config.get("customCommand");
    if (document) {
        const fileExtension = (0, path_1.extname)(document.fileName);
        GetCodeFileAndExecute(fileExtension, executor, false);
    }
    else {
        ExecuteCommand(executor, false);
    }
}
function RunByLanguage() {
    const config = GetConfiguration("code-runner");
    const executorMap = config.get("executorMap");
    vscode.window
        .showQuickPick(Object.keys(executorMap), {
        placeHolder: "Type or select language to run",
    })
        .then((languageId) => {
        if (languageId !== undefined) {
            Run(languageId);
        }
    });
}
function Stop() {
    StopRunning();
}
function Dispose() {
    StopRunning();
}
function CheckIsRunFromExplorer(fileUri) {
    const editor = vscode.window.activeTextEditor;
    if (!fileUri || !fileUri.fsPath) {
        return false;
    }
    if (!editor) {
        return true;
    }
    if (fileUri.fsPath === editor.document.uri.fsPath) {
        return false;
    }
    return true;
}
function StopRunning() {
    if (isRunning) {
        isRunning = false;
        vscode.commands.executeCommand("setContext", "code-runner.codeRunning", false);
        const kill = require("tree-kill");
        kill(process.pid);
    }
}
function Initialize() {
    config = GetConfiguration("code-runner");
    cwd = config.get("cwd");
    if (cwd) {
        return;
    }
    workspaceFolder = GetWorkspaceFolder();
    if ((config.get("fileDirectoryAsCwd") || !workspaceFolder) &&
        document &&
        !document.isUntitled) {
        cwd = (0, path_1.dirname)(document.fileName);
    }
    else {
        cwd = workspaceFolder;
    }
    if (cwd) {
        return;
    }
    cwd = TmpDir;
}
function GetConfiguration(section) {
    return (0, util_1.UtilityGetConfiguration)(section, document);
}
function GetWorkspaceFolder() {
    if (vscode.workspace.workspaceFolders) {
        if (document) {
            const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
            if (workspaceFolder) {
                return workspaceFolder.uri.fsPath;
            }
        }
        return vscode.workspace.workspaceFolders[0].uri.fsPath;
    }
    else {
        return undefined;
    }
}
function GetCodeFileAndExecute(fileExtension, executor, appendFile = true) {
    let selection;
    const activeTextEditor = vscode.window.activeTextEditor;
    if (activeTextEditor) {
        selection = activeTextEditor.selection;
    }
    const ignoreSelection = config.get("ignoreSelection");
    if ((runFromExplorer || !selection || selection.isEmpty || ignoreSelection) &&
        !document.isUntitled) {
        isTmpFile = false;
        codeFile = document.fileName;
        if (config.get("saveAllFilesBeforeRun")) {
            return vscode.workspace.saveAll().then(() => {
                ExecuteCommand(executor, appendFile);
            });
        }
        if (config.get("saveFileBeforeRun")) {
            return document.save().then(() => {
                ExecuteCommand(executor, appendFile);
            });
        }
    }
    else {
        let text = runFromExplorer || !selection || selection.isEmpty || ignoreSelection
            ? document.getText()
            : document.getText(selection);
        if (languageId === "php") {
            text = text.trim();
            if (!text.startsWith("<?php")) {
                text = "<?php\r\n" + text;
            }
        }
        isTmpFile = true;
        const folder = document.isUntitled ? cwd : (0, path_1.dirname)(document.fileName);
        CreateRandomFile(text, folder, fileExtension);
    }
    ExecuteCommand(executor, appendFile);
}
function RndName() {
    return Math.random()
        .toString(36)
        .replace(/[^a-z]+/g, "")
        .substr(0, 10);
}
function CreateRandomFile(content, folder, fileExtension) {
    let fileType = "";
    const languageIdToFileExtensionMap = config.get("languageIdToFileExtensionMap");
    if (languageId && languageIdToFileExtensionMap[languageId]) {
        fileType = languageIdToFileExtensionMap[languageId];
    }
    else {
        if (fileExtension) {
            fileType = fileExtension;
        }
        else {
            fileType = "." + languageId;
        }
    }
    const temporaryFileName = config.get("temporaryFileName");
    const tmpFileNameWithoutExt = temporaryFileName
        ? temporaryFileName
        : "temp" + RndName();
    const tmpFileName = tmpFileNameWithoutExt + fileType;
    codeFile = (0, path_1.join)(folder, tmpFileName);
    fs.writeFileSync(codeFile, content);
}
function GetExecutor(languageIdParam, fileExtension) {
    languageId = languageIdParam === null ? document.languageId : languageIdParam;
    let executor = null;
    if (languageIdParam == null && config.get("respectShebang")) {
        const firstLineInFile = document.lineAt(0).text;
        if (/^#!(?!\[)/.test(firstLineInFile)) {
            executor = firstLineInFile.slice(2);
        }
    }
    if (executor == null) {
        const executorMapByGlob = config.get("executorMapByGlob");
        if (executorMapByGlob) {
            const fileBasename = (0, path_1.basename)(document.fileName);
            for (const glob of Object.keys(executorMapByGlob)) {
                if (micromatch.isMatch(fileBasename, glob)) {
                    executor = executorMapByGlob[glob];
                    break;
                }
            }
        }
    }
    const executorMap = config.get("executorMap");
    if (executor == null) {
        executor = executorMap[languageId];
    }
    if (executor == null && fileExtension) {
        const executorMapByFileExtension = config.get("executorMapByFileExtension");
        executor = executorMapByFileExtension[fileExtension];
        if (executor != null) {
            languageId = fileExtension;
        }
    }
    if (executor == null) {
        languageId = config.get("defaultLanguage");
        executor = executorMap[languageId];
    }
    return executor;
}
function ExecuteCommand(executor, appendFile = true) {
    if (config.get("runInTerminal")) {
        ExecuteCommandInTerminal(executor, appendFile);
    }
    else {
        ExecuteCommandInOutputChannel(executor, appendFile);
    }
}
function GetWorkspaceRoot(codeFileDir) {
    return workspaceFolder ? workspaceFolder : codeFileDir;
}
function GetCodeBaseFile() {
    const regexMatch = codeFile.match(/.*[\/\\](.*)/);
    return regexMatch ? regexMatch[1] : codeFile;
}
function GetCodeFileWithoutDirAndExt() {
    const regexMatch = codeFile.match(/.*[\/\\](.*(?=\..*))/);
    return regexMatch ? regexMatch[1] : codeFile;
}
function GetCodeFileDir() {
    const regexMatch = codeFile.match(/(.*[\/\\]).*/);
    return regexMatch ? regexMatch[1] : codeFile;
}
function GetDriveLetter() {
    const regexMatch = codeFile.match(/^([A-Za-z]:).*/);
    return regexMatch ? regexMatch[1] : "$driveLetter";
}
function GetCodeFileDirWithoutTrailingSlash() {
    return GetCodeFileDir().replace(/[\/\\]$/, "");
}
function QuoteFileName(fileName) {
    return '"' + fileName + '"';
}
function GetFinalCommandToRunCodeFile(executor_1) {
    return __awaiter(this, arguments, void 0, function* (executor, appendFile = true) {
        let cmd = executor;
        if (codeFile) {
            const codeFileDir = GetCodeFileDir();
            const pythonPath = cmd.includes("$pythonPath")
                ? yield (0, util_1.GetPythonPath)(document)
                : constants_1.Constants.python;
            const placeholders = [
                {
                    regex: /\$workspaceRoot/g,
                    replaceValue: GetWorkspaceRoot(codeFileDir),
                },
                {
                    regex: /\$fileNameWithoutExt/g,
                    replaceValue: GetCodeFileWithoutDirAndExt(),
                },
                { regex: /\$fullFileName/g, replaceValue: QuoteFileName(codeFile) },
                { regex: /\$fileName/g, replaceValue: GetCodeBaseFile() },
                { regex: /\$driveLetter/g, replaceValue: GetDriveLetter() },
                {
                    regex: /\$dirWithoutTrailingSlash/g,
                    replaceValue: QuoteFileName(GetCodeFileDirWithoutTrailingSlash()),
                },
                { regex: /\$dir/g, replaceValue: QuoteFileName(codeFileDir) },
                { regex: /\$pythonPath/g, replaceValue: pythonPath },
            ];
            placeholders.forEach((placeholder) => {
                cmd = cmd.replace(placeholder.regex, placeholder.replaceValue);
            });
        }
        return cmd !== executor
            ? cmd
            : executor + (appendFile ? " " + QuoteFileName(codeFile) : "");
    });
}
function ChangeExecutorFromCmdToPs(executor) {
    if (executor.includes(" && ") && IsPowershellOnWindows()) {
        let replacement = "; if ($?) {";
        executor = executor.replace("&&", replacement);
        replacement = "} " + replacement;
        executor = executor.replace(/&&/g, replacement);
        executor = executor.replace(/\$dir\$fileNameWithoutExt/g, ".\\$fileNameWithoutExt");
        return executor + " }";
    }
    return executor;
}
function IsPowershellOnWindows() {
    if (os.platform() === "win32") {
        const defaultProfile = vscode.workspace
            .getConfiguration("terminal")
            .get("integrated.defaultProfile.windows");
        if (defaultProfile) {
            if (defaultProfile.toLowerCase().includes("powershell")) {
                return true;
            }
            else if (defaultProfile === "Command Prompt") {
                return false;
            }
        }
        const windowsShell = vscode.env.shell;
        return windowsShell && windowsShell.toLowerCase().includes("powershell");
    }
    return false;
}
function ChangeFilePathForBashOnWindows(command) {
    if (os.platform() === "win32") {
        const windowsShell = vscode.env.shell;
        const terminalRoot = config.get("terminalRoot");
        if (windowsShell && terminalRoot) {
            command = command
                .replace(/([A-Za-z]):\\/g, (match, p1) => `${terminalRoot}${p1.toLowerCase()}/`)
                .replace(/\\/g, "/");
        }
        else if (windowsShell &&
            windowsShell.toLowerCase().indexOf("bash") > -1 &&
            windowsShell.toLowerCase().indexOf("windows") > -1) {
            command = command.replace(/([A-Za-z]):\\/g, Replacer).replace(/\\/g, "/");
        }
    }
    return command;
}
function Replacer(match, p1) {
    return `/mnt/${p1.toLowerCase()}/`;
}
function ExecuteCommandInTerminal(executor_1) {
    return __awaiter(this, arguments, void 0, function* (executor, appendFile = true) {
        let isNewTerminal = false;
        if (terminal === null) {
            terminal = vscode.window.createTerminal("Code");
            isNewTerminal = true;
        }
        terminal.show(config.get("preserveFocus"));
        executor = ChangeExecutorFromCmdToPs(executor);
        let command = yield GetFinalCommandToRunCodeFile(executor, appendFile);
        command = ChangeFilePathForBashOnWindows(command);
        if (config.get("clearPreviousOutput") && !isNewTerminal) {
            yield vscode.commands.executeCommand("workbench.action.terminal.clear");
        }
        if (config.get("fileDirectoryAsCwd")) {
            const cwdPath = ChangeFilePathForBashOnWindows(cwd);
            terminal.sendText(`cd "${cwdPath}"`);
        }
        terminal.sendText(command);
    });
}
function ExecuteCommandInOutputChannel(executor_1) {
    return __awaiter(this, arguments, void 0, function* (executor, appendFile = true) {
        isRunning = true;
        vscode.commands.executeCommand("setContext", "code-runner.codeRunning", true);
        const clearPreviousOutput = config.get("clearPreviousOutput");
        if (clearPreviousOutput) {
            outputChannel.clear();
        }
        const showExecutionMessage = config.get("showExecutionMessage");
        outputChannel.show(config.get("preserveFocus"));
        const spawn = require("child_process").spawn;
        const command = yield GetFinalCommandToRunCodeFile(executor, appendFile);
        if (showExecutionMessage) {
            outputChannel.appendLine("[Running] " + command);
        }
        const startTime = new Date();
        process = spawn(command, [], { cwd: cwd, shell: true });
        process.stdout.on("data", (data) => {
            outputChannel.append(data.toString());
        });
        process.stderr.on("data", (data) => {
            outputChannel.append(data.toString());
        });
        process.on("close", (code) => {
            isRunning = false;
            vscode.commands.executeCommand("setContext", "code-runner.codeRunning", false);
            const endTime = new Date();
            const elapsedTime = (endTime.getTime() - startTime.getTime()) / 1000;
            outputChannel.appendLine("");
            if (showExecutionMessage) {
                outputChannel.appendLine("[Done] exited with code=" + code + " in " + elapsedTime + " seconds");
                outputChannel.appendLine("");
            }
            if (isTmpFile) {
                fs.unlinkSync(codeFile);
            }
        });
    });
}
//# sourceMappingURL=main.js.map