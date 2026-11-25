# Recognition validation

## Completed checks

On 2026-11-08, all three model binaries were acquired and verified against their fixed SHA-256 values. Actual inference ran successfully with the installed `onnxruntime-web` WASM backend, one thread. These are host execution checks, not Huawei phone performance measurements.

| Graph | Verified input | Verified output | Shape |
| --- | --- | --- | --- |
| U²-NetP | `input.1`, float32 `[1,3,320,320]` | `1959` (first fused output) | float32 `[1,1,320,320]` |
| CLIP text q8 | Tokenized category/style/season prompts | `text_embeds` | float32 `[22,512]` |
| CLIP vision q8 | `pixel_values`, float32 `[1,3,224,224]` | `image_embeds` | float32 `[1,512]` |

U²-NetP additionally emitted six side outputs, `1960` through `1965`, each `[1,1,320,320]`. The application should use the first fused output.

The script generated 10 category vectors, 10 style vectors, and 2 season vectors with the real pinned CLIP text encoder and tokenizer. Category/style IDs are preserved from the current taxonomy. Season IDs are `summer` and `winter`, described by the English prompts “lightweight summer clothing for hot weather” and “warm winter clothing for cold weather”, each prefixed with “a photo of”. Each vector is finite, nonzero, and L2 normalized. No fixed or invented embeddings are present. Full actual-run measurements are in the ignored preparation cache `work/model-assets/validation.json`. Season output remains an automatic suggestion requiring confirmation when ambiguous; visual similarity cannot establish actual garment warmth.

The initial measured setup-plus-inference times on this host were approximately 1,834 ms for segmentation, 479 ms for a batch of 20 text prompts, and 340 ms for vision. They do not estimate mobile timings. A native ONNX Node DLL did not initialize on this Windows host; preparation therefore uses the browser WASM engine directly, avoiding that optional native dependency.

## Preprocessing contract

U²-NetP: convert RGB; stretch to 320×320; divide pixel values by the maximum channel value in the resized image (guard a zero maximum); subtract `[0.485,0.456,0.406]` and divide by `[0.229,0.224,0.225]`; arrange NCHW. Min/max normalize the first output with a zero-range guard, resize the alpha map back to the working-image size, and composite against the chosen background. Follow the original rembg code, not an accidental double division by 255.

CLIP: RGB; resize the shortest edge to 224; center crop 224×224; bicubic resampling; divide by 255; subtract `[0.48145466,0.4578275,0.40821073]` and divide by `[0.26862954,0.26130258,0.27577711]`; arrange NCHW. Compare the L2-normalized image vector with normalized label vectors using cosine similarity. Similarity/softmax values are not measured recognition accuracy.

## Limits of completed validation

The preparation smoke inputs for segmentation and vision were zero-filled tensors. This verifies graph loading, tensor names, shapes, finite output, and local inference. The application browser additionally processed a synthetic knit illustration: actual foreground extraction and classification completed, the top category was 上衣, and the extracted color was 燕麦米. Manual season/style confirmation, persistence, and background replacement with unchanged color labels were checked. This is a synthetic workflow check, not a real-photo accuracy benchmark. Real-photo edge quality and Huawei Mate 80 Pro checks remain separate acceptance work.

U²-NetP detects salient foreground and is not a garment-only parser. A worn garment photo can retain the person; multiple subjects, fine straps, lace, translucent fabric, and similar foreground/background colors may require manual correction. CLIP style suggestions are subjective. Single images do not reliably reveal fabric warmth or true season suitability. Preserve the manual editing path and never overwrite confirmed user labels with new automatic suggestions.

## Huawei Mate 80 Pro acceptance criteria

Official specifications list HarmonyOS 6.0, 2832×1280 native display pixels, and camera images up to 8192×6144: https://consumer.huawei.com/cn/phones/mate80-pro/specs/. Native pixels are not CSS viewport pixels. Downsample large camera photos before Canvas operations and sequential model inference.

Huawei Browser changes the visible viewport as its address bar and bottom toolbar show or hide: https://consumer.huawei.com/cn/support/content/zh-cn16089660/. Check dynamic height, keyboard appearance, bottom navigation safe areas, landscape, and editor dialogs. Provide safe fallbacks for unavailable browser capabilities rather than infer them from the UA string.

Website camera/location permissions, JavaScript, cookies, and per-site UA overrides are browser settings: https://consumer.huawei.com/cn/support/content/zh-cn16010262/. Test denied camera permission, an album-only path, denied location with manual city, and site login cookies.

ArkWeb documentation confirms a WebAssembly execution engine: https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/web-component-process/. It does not validate this specific phone/browser/model combination. WebGPU support, PWA installation, model download time, actual inference speed, memory pressure, and background/resume behavior require a real device. Desktop mobile emulation or a Huawei-like UA is not a real-device pass.
