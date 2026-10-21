/**
 * Server-only image provider abstraction for Tess's dynamically generated photos.
 * Swap providers by adding another implementation of `ImageProvider`.
 */
const GATEWAY = "https://ai.gateway.lovable.dev";

export type TessImageType = "object" | "casual_selfie" | "personal_selfie" | "intimate_selfie" | "tess_candid";

export type GeneratedImage = { bytes: Uint8Array; mime: string; provider: string; model: string };

export interface ImageProvider {
  name: string;
  model: string;
  /** With a reference: identity-conditioned edit. Without: plain generation. */
  generate(prompt: string, reference: Blob | null): Promise<GeneratedImage>;
}

const IDENTITY = `Create a photorealistic casual phone photograph of the exact same adult woman shown in the supplied Tess Morgan canonical identity reference image. Tess is 34 years old. Preserve her facial identity, facial proportions, pale green-gray eyes, light platinum blonde hair, apparent age, and recognizable features. This must depict the same individual, not merely a similar-looking woman. Hair styling, clothing, expression, makeup and setting may change naturally.`;

const STYLE = `Use ordinary contemporary adult clothing. Avoid school uniforms, fantasy clothing, cosplay, fashion-editorial styling, or glamorous studio photography. Nothing revealing or suggestive. It should look like a real phone photo: imperfect framing, ordinary slightly messy surroundings, natural ambient light, realistic skin texture, maybe slight motion blur or grain. Not professional photography. No text overlays, no watermarks.`;

const MABEL = `Mabel is Tess's rescue dog: a scruffy medium-sized brown-and-white wire-haired mutt with floppy ears.`;

export const includesTess = (t: TessImageType) => t !== "object";

export function buildImagePrompt(type: TessImageType, scene: string, expression: string | null) {
  const mabel = /mabel|dog/i.test(scene) ? ` ${MABEL}` : "";
  if (!includesTess(type)) {
    return `A casual realistic smartphone photo taken by a 34-year-old woman in a mid-sized Pennsylvania city. Scene: ${scene}.${mabel} No people's faces visible. ${STYLE}`;
  }
  const selfie = type === "tess_candid" ? "" : " It is a front-camera selfie held at arm's length.";
  return `${IDENTITY}\n\nScene: ${scene}.${selfie}${expression ? ` Her expression: ${expression}.` : ""}${mabel}\n\n${STYLE}`;
}

export function lovableGatewayProvider(apiKey: string): ImageProvider {
  const model = "openai/gpt-image-2.5-sunburst";
  return {
    name: "lovable-ai-gateway",
    model,
    async generate(prompt, reference) {
      let res: Response;
      if (reference) {
        const form = new FormData();
        form.set("model", model);
        form.set("prompt", prompt);
        form.set("size", "1024x1536");
        form.set("quality", "medium");
        form.append("image", reference, "tess-reference.jpg");
        res = await fetch(`${GATEWAY}/v1/images/edits`, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}` },
          body: form,
        });
      } else {
        res = await fetch(`${GATEWAY}/v1/images/generations`, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model, prompt, size: "1024x1536", quality: "medium" }),
        });
      }
      if (!res.ok) throw new Error(`image ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const json = (await res.json()) as { data?: { b64_json?: string }[] };
      const b64 = json.data?.[0]?.b64_json;
      if (!b64) throw new Error("image: empty result");
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return { bytes, mime: "image/png", provider: "lovable-ai-gateway", model };
    },
  };
}

export async function generateTessImage(args: {
  provider: ImageProvider;
  reference: Blob | null;
  type: TessImageType;
  scene: string;
  expression: string | null;
}) {
  const prompt = buildImagePrompt(args.type, args.scene, args.expression);
  const needsRef = includesTess(args.type);
  if (needsRef && !args.reference) throw new Error("missing canonical reference");
  return args.provider.generate(prompt, needsRef ? args.reference : null);
}
