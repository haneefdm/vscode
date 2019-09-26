/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { IHostService } from 'vs/workbench/services/host/browser/host';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IWorkbenchLayoutService } from 'vs/workbench/services/layout/browser/layoutService';
import { IResourceEditor, IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IWindowSettings, IWindowOpenable, IOpenInWindowOptions, isFolderToOpen, isWorkspaceToOpen, isFileToOpen, IOpenEmptyWindowOptions } from 'vs/platform/windows/common/windows';
import { pathsToEditors } from 'vs/workbench/common/editor';
import { IFileService } from 'vs/platform/files/common/files';
import { ILabelService } from 'vs/platform/label/common/label';
import { trackFocus } from 'vs/base/browser/dom';
import { Disposable } from 'vs/base/common/lifecycle';

export class BrowserHostService extends Disposable implements IHostService {

	_serviceBrand: undefined;

	//#region Events

	get onDidChangeFocus(): Event<boolean> { return this._onDidChangeFocus; }
	private _onDidChangeFocus: Event<boolean>;

	//#endregion

	constructor(
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IEditorService private readonly editorService: IEditorService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IFileService private readonly fileService: IFileService,
		@ILabelService private readonly labelService: ILabelService
	) {
		super();

		this.registerListeners();
	}

	private registerListeners(): void {

		// Track Focus on Window
		const focusTracker = this._register(trackFocus(window));
		this._onDidChangeFocus = Event.any(
			Event.map(focusTracker.onDidFocus, () => this.hasFocus),
			Event.map(focusTracker.onDidBlur, () => this.hasFocus)
		);
	}

	//#region Window

	readonly windowCount = Promise.resolve(1);

	async openInWindow(toOpen: IWindowOpenable[], options?: IOpenInWindowOptions): Promise<void> {
		// TODO@Ben delegate to embedder
		const { openFolderInNewWindow } = this.shouldOpenNewWindow(options);
		for (let i = 0; i < toOpen.length; i++) {
			const openable = toOpen[i];
			openable.label = openable.label || this.getRecentLabel(openable);

			// Folder
			if (isFolderToOpen(openable)) {
				const newAddress = `${document.location.origin}${document.location.pathname}?folder=${openable.folderUri.path}`;
				if (openFolderInNewWindow) {
					window.open(newAddress);
				} else {
					window.location.href = newAddress;
				}
			}

			// Workspace
			else if (isWorkspaceToOpen(openable)) {
				const newAddress = `${document.location.origin}${document.location.pathname}?workspace=${openable.workspaceUri.path}`;
				if (openFolderInNewWindow) {
					window.open(newAddress);
				} else {
					window.location.href = newAddress;
				}
			}

			// File
			else if (isFileToOpen(openable)) {
				const inputs: IResourceEditor[] = await pathsToEditors([openable], this.fileService);
				this.editorService.openEditors(inputs);
			}
		}
	}

	private getRecentLabel(openable: IWindowOpenable): string {
		if (isFolderToOpen(openable)) {
			return this.labelService.getWorkspaceLabel(openable.folderUri, { verbose: true });
		}

		if (isWorkspaceToOpen(openable)) {
			return this.labelService.getWorkspaceLabel({ id: '', configPath: openable.workspaceUri }, { verbose: true });
		}

		return this.labelService.getUriLabel(openable.fileUri);
	}

	private shouldOpenNewWindow(options: IOpenInWindowOptions = {}): { openFolderInNewWindow: boolean } {
		const windowConfig = this.configurationService.getValue<IWindowSettings>('window');
		const openFolderInNewWindowConfig = (windowConfig && windowConfig.openFoldersInNewWindow) || 'default' /* default */;

		let openFolderInNewWindow = !!options.forceNewWindow && !options.forceReuseWindow;
		if (!options.forceNewWindow && !options.forceReuseWindow && (openFolderInNewWindowConfig === 'on' || openFolderInNewWindowConfig === 'off')) {
			openFolderInNewWindow = (openFolderInNewWindowConfig === 'on');
		}

		return { openFolderInNewWindow };
	}

	async openEmptyWindow(options?: IOpenEmptyWindowOptions): Promise<void> {
		// TODO@Ben delegate to embedder
		const targetHref = `${document.location.origin}${document.location.pathname}?ew=true`;
		if (options && options.reuse) {
			window.location.href = targetHref;
		} else {
			window.open(targetHref);
		}
	}

	async toggleFullScreen(): Promise<void> {
		const target = this.layoutService.getWorkbenchElement();

		// Chromium
		if (document.fullscreen !== undefined) {
			if (!document.fullscreen) {
				try {
					return await target.requestFullscreen();
				} catch (error) {
					console.warn('Toggle Full Screen failed'); // https://developer.mozilla.org/en-US/docs/Web/API/Element/requestFullscreen
				}
			} else {
				try {
					return await document.exitFullscreen();
				} catch (error) {
					console.warn('Exit Full Screen failed');
				}
			}
		}

		// Safari and Edge 14 are all using webkit prefix
		if ((<any>document).webkitIsFullScreen !== undefined) {
			try {
				if (!(<any>document).webkitIsFullScreen) {
					(<any>target).webkitRequestFullscreen(); // it's async, but doesn't return a real promise.
				} else {
					(<any>document).webkitExitFullscreen(); // it's async, but doesn't return a real promise.
				}
			} catch {
				console.warn('Enter/Exit Full Screen failed');
			}
		}
	}

	get hasFocus(): boolean {
		return document.hasFocus();
	}

	async focus(): Promise<void> {
		window.focus();
	}

	//#endregion

	async restart(): Promise<void> {
		this.reload();
	}

	async reload(): Promise<void> {
		window.location.reload();
	}

	async closeWorkspace(): Promise<void> {
		return this.openEmptyWindow({ reuse: true });
	}
}

registerSingleton(IHostService, BrowserHostService, true);
