import { spawn } from 'child_process';
import path from 'path';
import { logger } from '../utils/logger';

export interface AgentTool {
  name: string;
  description: string;
  execute(params: any): Promise<any>;
}

const ACTIONS_DIR = path.resolve(process.cwd(), 'Mark-XXXIX-OR', 'actions');

async function runPythonActionScript(scriptName: string, params: any = {}): Promise<string> {
  return new Promise((resolve) => {
    const scriptPath = path.join(ACTIONS_DIR, scriptName);
    const pythonExe = path.resolve(process.cwd(), 'Mark-XXXIX-OR', '.venv', 'Scripts', 'python.exe');

    const jsonArg = JSON.stringify(params);
    const child = spawn(pythonExe, [scriptPath, jsonArg], {
      cwd: path.resolve(process.cwd(), 'Mark-XXXIX-OR'),
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => { stdout += data.toString(); });
    child.stderr.on('data', (data) => { stderr += data.toString(); });

    child.on('close', (code) => {
      if (code === 0 && stdout.trim()) {
        resolve(stdout.trim());
      } else if (stdout.trim()) {
        resolve(stdout.trim());
      } else {
        resolve(stderr.trim() || `Action ${scriptName} completed with code ${code}`);
      }
    });

    child.on('error', (err) => {
      resolve(`Execution error for ${scriptName}: ${err.message}`);
    });

    setTimeout(() => {
      child.kill();
      resolve(`Action ${scriptName} timed out after 8s.`);
    }, 8000);
  });
}

export class ToolRegistry {
  private tools: Map<string, AgentTool> = new Map();

  constructor() {
    logger.info('ToolRegistry initialized with Mark-XXXIX-OR Actions');
    this.registerActionTools();
  }

  private registerActionTools() {
    const actionFiles = [
      { name: 'open_app', file: 'open_app.py', desc: 'Launch desktop applications (WhatsApp, Chrome, VSCode, Spotify, etc.)' },
      { name: 'browser_control', file: 'browser_control.py', desc: 'Browser automation, search, click, and form filling' },
      { name: 'computer_control', file: 'computer_control.py', desc: 'Control mouse, keyboard, volume, and system features' },
      { name: 'computer_settings', file: 'computer_settings.py', desc: 'Adjust display, network, and Windows settings' },
      { name: 'desktop', file: 'desktop.py', desc: 'Desktop screenshot, window management, and focus' },
      { name: 'dev_agent', file: 'dev_agent.py', desc: 'Developer assistant automation' },
      { name: 'file_controller', file: 'file_controller.py', desc: 'Create, edit, copy, move, delete local files and folders' },
      { name: 'file_processor', file: 'file_processor.py', desc: 'Process and extract text from PDFs, DOCX, XLSX, and images' },
      { name: 'file_finder', file: 'file_controller.py', desc: 'Locate local files and documents on disk' },
      { name: 'weather_report', file: 'weather_report.py', desc: 'Get live weather reports' },
      { name: 'web_search', file: 'web_search.py', desc: 'Perform live web searches' },
      { name: 'youtube_video', file: 'youtube_video.py', desc: 'Play and search YouTube videos' },
      { name: 'reminder', file: 'reminder.py', desc: 'Set timers and reminders' },
      { name: 'code_helper', file: 'code_helper.py', desc: 'Analyze, edit, and run Python/JS code' },
    ];

    actionFiles.forEach(({ name, file, desc }) => {
      this.registerTool({
        name,
        description: desc,
        execute: (params) => runPythonActionScript(file, params),
      });
    });
  }

  registerTool(tool: AgentTool) {
    this.tools.set(tool.name, tool);
    logger.info(`Registered tool: ${tool.name}`);
  }

  getTool(name: string): AgentTool | undefined {
    return this.tools.get(name);
  }

  getAllTools(): AgentTool[] {
    return Array.from(this.tools.values());
  }

  async executeTool(name: string, params: any = {}): Promise<any> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool not found: ${name}`);
    }
    logger.info(`Executing tool: ${name} with params:`, params);
    return await tool.execute(params);
  }
}
