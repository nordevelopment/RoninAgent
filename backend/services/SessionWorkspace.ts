import path from 'path';
import fs from 'fs';
import { FileSystemManager } from './FileSystemManager.js';

/** Relative folders live in workspace; absolute folders are explicit user choices. */
export function sessionWorkspace(folder: string, workspaceManager: FileSystemManager): {
  root: string;
  manager: FileSystemManager;
} {
  if (path.isAbsolute(folder)) {
    if (!fs.statSync(folder).isDirectory() || fs.realpathSync(folder) !== path.resolve(folder)) {
      throw new Error('Selected folder is unavailable or has changed');
    }
    const manager = new FileSystemManager([folder]);
    return { root: manager.validatePath(folder), manager };
  }
  return { root: workspaceManager.validatePath(folder), manager: workspaceManager };
}

export function sessionAssetUrl(folder: string, sessionId: string, filename: string): string {
  return path.isAbsolute(folder)
    ? `/api/workspace/assets/${encodeURIComponent(sessionId)}/images/${encodeURIComponent(filename)}`
    : `/workspace/${folder}/images/${filename}`;
}
