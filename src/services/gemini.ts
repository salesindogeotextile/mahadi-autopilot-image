/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI } from "@google/genai";

const API_KEY = process.env.GEMINI_API_KEY;

const ai = new GoogleGenAI({ apiKey: API_KEY || "" });

export async function generatePrimaTexImage(inputs: {
  articleTitle: string;
  materialColor: string;
  overlayText: string;
  aspectRatio: string;
}) {
  const prompt = `Create a professional industrial banner advertisement for PrimaTex.
  
Visual Context Keywords:
- Project/Asset: "${inputs.articleTitle}"
- Headline: "${inputs.overlayText}"

Task:
Automatically identify the intended civil engineering material (like Geotextile, Geomembrane, Geogrid, or similar) from the keywords above.
Render a realistic large roll of this material partially unrolled.
The roll must show detailed textures: fiber structure, industrial weave, or smooth/textured polymer surface as appropriate for the product identified.
Color: ${inputs.materialColor}.

Background Setting:
Active civil engineering construction site in broad daylight. Bridge construction, yellow heavy machinery/excavators, soil and gravel ground.

Text & Branding:
1. Branding: White word "PrimaTex" only (modern sans-serif) at Top-Left. No logos/icons.
2. Main Headline: Bold, large text on the left: "${inputs.overlayText}". 
   - STYLE: USE WHITE COLOR.
   - TYPOGRAPHY: Clear, professional industrial font. USE GENEROUS LETTER SPACING (wide tracking) between characters to ensure perfect readability and prevent typos.
3. Sub Headline: A complementary professional 5-word subtitle. USE ACCENT PINK COLOR. Smaller scale. Use clean corporate spacing.
4. Technical Footer (Optional/Aksesoris): At the very bottom, add a clean dark-blue semi-transparent overlay bar. Inside this bar, include 3 or 4 small technical feature icons (like a shield for strength, a chain for bonding, or a droplet for filtration). Next to each icon, add very brief professional Indonesian text (e.g., "KUAT TARIK TINGGI", "TAHAN LAMA", "FILTRASI OPTIMAL"). This bar should look like a high-end product catalog feature.

Quality: 
Ultra high resolution, photorealistic industrial rendering, landscape ${inputs.aspectRatio}.

Negative Prompt:
cartoon, illustration, 3d render look, toy-like, plastic look, blurry, human hands, people, faces, low res.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [{ text: prompt }],
      },
      config: {
        imageConfig: {
          aspectRatio: inputs.aspectRatio,
        },
      },
    });

    const candidates = response.candidates;
    if (!candidates || candidates.length === 0) {
      throw new Error("No image generated (empty candidates).");
    }

    const content = candidates[0].content;
    if (!content || !content.parts) {
      throw new Error("No image generated (missing content parts).");
    }

    const parts = content.parts;
    let textResponse = "";

    for (const part of parts) {
      if (part.inlineData) {
        return {
          url: `data:image/png;base64,${part.inlineData.data}`,
          prompt: prompt
        };
      }
      if (part.text) {
        textResponse += part.text;
      }
    }

    if (textResponse) {
      throw new Error(`Model returned text instead of image: ${textResponse}`);
    }

    throw new Error("Image data not found in response.");
  } catch (error: any) {
    console.error("Error generating image:", error);
    if (error.message?.includes("Image data not found") || error.message?.includes("Model returned text")) {
       throw error;
    }
    throw new Error(`Generation Service Error: ${error.message || "Unknown error"}`);
  }
}
