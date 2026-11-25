import { common } from '@kit.AbilityKit';
import { webview } from '@kit.ArkWeb';
import { photoAccessHelper } from '@kit.MediaLibraryKit';
import { picker } from '@kit.CoreFileKit';
import { camera, cameraPicker } from '@kit.CameraKit';
import { util } from '@kit.ArkTS';
import { BackupFiles } from '../bridge/BackupFiles';

const ORIGIN: string = 'https://mori-app.invalid';
interface AssetInfo { path: string; mime: string; bytes: number; sha256: string }
interface PickerState { state: string; message: string }

@Entry
@Component
struct Index {
  @State private ready: boolean = false;
  @State private error: string = '';
  private controller: webview.WebviewController = new webview.WebviewController();
  private assets: Map<string, AssetInfo> = new Map();
  private context: common.UIAbilityContext = this.getUIContext().getHostContext() as common.UIAbilityContext;
  private files: BackupFiles = new BackupFiles(this.context, this.controller);

  aboutToAppear(): void {
    try {
      const bytes = this.context.resourceManager.getRawFileContentSync('offline/resource-index.json');
      const entries = JSON.parse(new util.TextDecoder('utf-8').decodeToString(bytes)) as AssetInfo[];
      entries.forEach(entry => this.assets.set('/' + entry.path, entry));
      this.ready = true;
    } catch (_) { this.error = '缺少离线资源，请先运行 offline:build 后重新编译安装。'; }
  }
  aboutToDisappear(): void {
    this.files.close();
    try { this.controller.deleteJavaScriptRegister('MoriFiles'); } catch (_) {}
  }
  onBackPress(): boolean {
    this.controller.runJavaScript('typeof window.moriBack === "function" ? window.moriBack() : false').then(result => {
      if (result === 'false') this.context.terminateSelf().catch(() => {});
    }).catch(() => {});
    return true;
  }
  private response(status: number, data: string | ArrayBuffer, mime: string): WebResourceResponse {
    const response = new WebResourceResponse();
    response.setResponseCode(status); response.setReasonMessage(status === 200 ? 'OK' : 'Unavailable');
    response.setResponseMimeType(mime); response.setResponseEncoding('utf-8');
    response.setResponseHeader([{ headerKey: 'Cache-Control', headerValue: 'no-cache' }, { headerKey: 'X-Content-Type-Options', headerValue: 'nosniff' }]);
    response.setResponseData(data); response.setResponseIsReady(true); return response;
  }
  private pickerState(state: string, message: string = ''): void {
    const detail: PickerState = { state, message };
    this.controller.runJavaScript(`window.dispatchEvent(new CustomEvent('mori-picker-state',{detail:${JSON.stringify(detail)}}))`).catch(() => {});
  }
  private async selectFile(event: OnShowFileSelectorEvent): Promise<void> {
    try {
      const accept = event.fileSelector.getAcceptType().join(',').toLowerCase();
      // ArkWeb may normalize MIME types to filename extensions or an empty list.
      // Only ZIP inputs belong to the backup picker; every other input here is a photo.
      const backup = accept.includes('zip');
      console.info(`MORI_PICKER kind=${backup ? 'backup' : 'photo'} capture=${event.fileSelector.isCapture()}`);
      if (!backup) {
        this.pickerState('opening');
        if (event.fileSelector.isCapture()) {
          const result = await cameraPicker.pick(this.context, [cameraPicker.PickerMediaType.PHOTO], { cameraPosition: camera.CameraPosition.CAMERA_POSITION_BACK });
          event.result.handleFileList(result.resultUri ? [result.resultUri] : []);
          this.pickerState(result.resultUri ? 'selected' : 'cancelled');
        } else {
          const result = await new photoAccessHelper.PhotoViewPicker().select({ MIMEType: photoAccessHelper.PhotoViewMIMETypes.IMAGE_TYPE, maxSelectNumber: 1 });
          event.result.handleFileList(result.photoUris);
          this.pickerState(result.photoUris.length ? 'selected' : 'cancelled');
        }
      } else {
        const result = await new picker.DocumentViewPicker(this.context).select({ maxSelectNumber: 1, fileSuffixFilters: ['沐衣备份|.zip'] });
        event.result.handleFileList(result);
      }
    } catch (_) {
      event.result.handleFileList([]);
      this.pickerState('error', '未能打开照片或文件选择器，请返回重试');
    }
  }
  build() {
    Column() {
      if (this.error) {
        Text('衣橱暂时没能打开').fontSize(23).fontColor('#79678A').margin({ bottom: 20 });
        Text(this.error).fontSize(14).fontColor('#8A858E').padding(25);
      } else if (this.ready) {
        Web({ src: ORIGIN + '/index.html' + (AppStorage.get<boolean>('moriSelfTest') === true ? '?selftest=1' : ''), controller: this.controller })
          .javaScriptAccess(true)
          .domStorageAccess(true)
          .databaseAccess(true)
          .fileAccess(true)
          .geolocationAccess(false)
          .backgroundColor('#F7F5F1')
          .javaScriptProxy({ object: this.files, name: 'MoriFiles', methodList: ['beginExport', 'appendExport', 'finishExport', 'cancelExport'], controller: this.controller })
          .onLoadIntercept(event => {
            const url = event.data.getRequestUrl();
            return !(url.startsWith(ORIGIN + '/') || url === 'about:blank' || url.startsWith('blob:' + ORIGIN + '/'));
          })
          .onInterceptRequest(event => {
            if (!event) return null;
            const url = event.request.getRequestUrl();
            if (url.startsWith('blob:') || url.startsWith('data:')) return null;
            if (!url.startsWith(ORIGIN + '/')) return this.response(403, 'Offline application', 'text/plain');
            const pathname = url.substring(ORIGIN.length).split('?')[0];
            const info = this.assets.get(pathname === '/' ? '/index.html' : pathname);
            if (!info) return this.response(404, 'Local resource not found', 'text/plain');
            try {
              const bytes = this.context.resourceManager.getRawFileContentSync('offline/' + info.path);
              const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
              return this.response(200, buffer, info.mime);
            } catch (_) { return this.response(404, 'Local resource unavailable', 'text/plain'); }
          })
          .onShowFileSelector(event => { if (!event) return false; this.selectFile(event); return true; })
          .width('100%').height('100%');
      } else { LoadingProgress().color('#79678A'); }
    }.width('100%').height('100%').backgroundColor('#F7F5F1').justifyContent(FlexAlign.Center);
  }
}
