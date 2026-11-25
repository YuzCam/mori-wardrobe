# Model provenance and redistribution notices

The deployed application performs inference locally. No paid AI endpoint, model subscription, or per-inference service is required. Model files are served by the same site. Hugging Face and hf-mirror are build-time sources, not runtime API dependencies.

## U²-NetP

- Original project: https://github.com/xuebinqin/U-2-Net
- Authors: Xuebin Qin, Zichen Zhang, Chenyang Huang, Masood Dehghan, Osmar R. Zaiane, Martin Jagersand.
- Paper: *U²-Net: Going Deeper with Nested U-Structure for Salient Object Detection*, Pattern Recognition 106 (2020), 107404.
- Weight license: Apache-2.0. Complete license distributed at `public/model-metadata/APACHE-2.0.txt`.
- ONNX release provenance: https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2netp.onnx
- Pinned source: https://huggingface.co/tomjackson2023/rembg/resolve/cd3a3d6767a7859efea31ef0f2f373582cf06d82/u2netp.onnx
- File size: 4,574,861 bytes.
- SHA-256: `309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8`.
- Additional published verification: https://huggingface.co/skillsafe-ai/u2netp

## CLIP ViT-B/32, quantized ONNX

- Original project: https://github.com/openai/CLIP
- Copyright (c) 2021 OpenAI. MIT license, complete notice distributed at `public/model-metadata/CLIP-MIT.txt`.
- ONNX conversion/model repository: https://huggingface.co/Xenova/clip-vit-base-patch32 (MIT).
- Pinned repository revision: `6b7c523703ae26e39be4b03774966f8571c7f523`.
- Vision file: `onnx/vision_model_quantized.onnx`, 89,117,001 bytes, SHA-256 `583fd1110a514667812fee7d684952aaf82a99b959760c8d7dca7e0ab9839299`.
- Text file: `onnx/text_model_quantized.onnx`, 64,504,507 bytes, SHA-256 `73baab855d406190da9faa498cfedf65f15cf309f4cc7385b7b032e6d08e5c3a`.
- The text model is used only during preparation. The deployed browser receives the vision graph and 22 normalized text vectors: 10 category and 10 style vectors from `config/taxonomy.ts`, plus summer/winter vectors generated from descriptive English season prompts.

## Transport and integrity

The upstream weights were not modified. The preparation script splits the deployed graphs into ordered segments of at most 16 MiB, below the static hosting per-file limit. Concatenation exactly restores the verified upstream ONNX file. Each segment and complete model has its SHA-256 in `public/model-metadata/manifest.json`.

The first attempt to reach huggingface.co failed on the build host, including with elevated network permissions. Downloads succeeded through https://hf-mirror.com using the same immutable source paths. All three binary SHA-256 values matched the independently recorded upstream values. This alternate transport does not change model provenance or licenses.

Repeat preparation using `node scripts/prepare-models.mjs`; use `--mirror` for the verified alternate transport, or `--skip-download` to rebuild solely from the already verified local preparation cache. The script does not emit an apparently ready manifest if inference or checksum validation fails.

Additional source attribution and the transport-only modification notice are shipped in `public/model-metadata/NOTICE.txt`.
