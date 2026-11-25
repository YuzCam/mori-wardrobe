import { UIAbility, Want } from '@kit.AbilityKit';
import { window } from '@kit.ArkUI';

export default class EntryAbility extends UIAbility {
  onCreate(want: Want): void {
    AppStorage.setOrCreate('moriSelfTest', want.parameters?.['moriSelfTest'] === true);
  }
  onWindowStageCreate(stage: window.WindowStage): void {
    stage.loadContent('pages/Index', error => {
      if (error.code) console.error(`沐衣启动失败：${error.code}`);
    });
  }
}
