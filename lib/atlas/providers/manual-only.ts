import { emptyRecognitionResult, type AtlasVisionInput, type AtlasVisionProvider } from "../vision-provider";

export class ManualOnlyAtlasProvider implements AtlasVisionProvider {
  name = "manual-only";

  async recognizePrimary(_input: AtlasVisionInput) {
    return emptyRecognitionResult(this.name, "manual", "manual input required");
  }

  async recognizeFine(_input: AtlasVisionInput) {
    return emptyRecognitionResult(this.name, "manual", "manual input required");
  }
}
