import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export interface ShapePart {
  type: 'box' | 'sphere' | 'cylinder' | 'cone' | 'torus' | 'capsule';
  color: string;
  position: [number, number, number];
  scale: [number, number, number];
  rotation: [number, number, number];
  tag: string; // Semantic label (e.g., "head", "left_arm", "torso")
  parent?: string; // Tag of the parent part (for 3D hierarchy)
  folder?: string; // Name of the folder (for UI hierarchy)
  pivotOffset?: [number, number, number]; // Offset of the mesh relative to its pivot point
  opacity?: number; // 0 to 1
}

export interface Suggestion {
  text: string;
  consciousnessScore: number; // 0 to 5
}

export interface GenerationResult {
  parts: ShapePart[];
  suggestions: Suggestion[];
}

export interface FolderData {
  name: string;
  position: [number, number, number];
  scale: [number, number, number];
  rotation: [number, number, number];
  visible: boolean;
}

export async function generate3DObject(
  prompt: string, 
  currentParts: ShapePart[] = [], 
  onDebug?: (info: string) => void,
  modelName: string = "gemini-3.1-pro-preview"
): Promise<GenerationResult> {
  const isIteration = currentParts.length > 0;
  
  onDebug?.(`Iniciando generación ${isIteration ? 'iterativa' : 'inicial'} con ${modelName} para: "${prompt}"`);
  
  const contents = isIteration 
    ? [
        { role: 'user', parts: [{ text: `Current 3D object parts: ${JSON.stringify(currentParts)}` }] },
        { role: 'user', parts: [{ text: `Modify or improve this object based on: "${prompt}". 
          Return the FULL updated JSON array of parts and up to 10 suggestions for the next improvements.
          
          CRITICAL INSTRUCTIONS:
          1. HIERARCHY RULES:
             - "parent" MUST be the "tag" of a physical part (box, sphere, etc.).
             - NEVER use folder tags (e.g., "Mejora 10:11:45") as a parent. Folders are for UI only.
             - If a part has a "parent", its "position" is RELATIVE to that parent's center.
             - PRESERVE existing "parent" relationships unless explicitly asked to change the hierarchy.
          2. COORDINATE STABILITY:
             - DO NOT change the position, scale, or rotation of existing parts unless explicitly requested.
             - Maintain exact values for parts that are not being modified to avoid "drifting" or accidental movement.
          3. MULTIPLE IMPROVEMENTS & FOLDERS:
             - If the user requests multiple distinct improvements (e.g., "a hat and a cane"), use the "folder" property to group parts belonging to each improvement.
             - PRESERVE the "folder" property for all existing parts. DO NOT remove or change them.
             - Example: parts for the hat should have folder: "Sombrero", parts for the cane should have folder: "Baston".
             - IMPORTANT: New parts like "eyes", "ears", "buttons" should ALWAYS be grouped into a descriptive folder (e.g., "Ojos", "Detalles").
             - This allows the UI to group them into separate folders automatically.
          4. Maintain a robust hierarchical structure (e.g., "antenna_stem" and "antenna_light" should have parent "antenna").
          4. Ensure all parts have unique and descriptive "tag" values.
          5. When improving, focus on REALISM and FUNCTIONAL COMPLETENESS. 
          6. The "suggestions" should be logical next steps to make the object more professional and complete. Generate up to 10 distinct suggestions.
          7. For each suggestion, provide a "consciousnessScore" from 0 to 5, representing how much this improvement increases the model's complexity, intelligence, or "consciousness" (aumento de consciencia).
          8. Keep existing tags and hierarchy unless they are being intentionally replaced or improved.
          9. COORDINATE SYSTEM: Y is UP. X is LEFT/RIGHT. Z is FRONT/BACK.
          10. SCALE & PROPORTIONS:
              - Use a human scale as reference (1.73m height).
              - The floor grid is 1x1 meter.
              - Ensure harmony and realistic proportions between all created objects.
          11. RELATIVE POSITIONING (CRITICAL):
              - If a part has a "parent", its "position" MUST be RELATIVE to that parent's center.
              - Example: If the head is at [0, 2, 0] and the eye is on the head, the eye's position should be something like [0.2, 0.1, 0.5], NOT [0.2, 2.1, 0.5].
              - Pupils MUST be relative to the eye. If an eye is at [0.3, 0, 0.5], the pupil should be at [0, 0, 0.1] relative to the eye.
          12. SCALE INDEPENDENCE: Parent scale does NOT affect child scale. Use absolute scales for all parts.` }] }
      ]
    : [
        { role: 'user', parts: [{ text: `Generate a detailed 3D object representation for: "${prompt}". 
          Return a JSON object with:
          1. "parts": An array of parts. Each part must have:
             - type: one of 'box', 'sphere', 'cylinder', 'cone', 'torus', 'capsule'
             - color: hex string (e.g. "#ff0000")
             - position: [x, y, z] numbers
             - scale: [x, y, z] numbers
             - rotation: [x, y, z] numbers (in radians)
             - tag: A unique semantic label (e.g., "head", "torso", "right_leg").
             - parent: (Optional) The tag of the parent part to create a hierarchy (e.g., "eye" has parent "head").
             - folder: (Optional) A name to group related parts in the UI.
          
          CRITICAL DESIGN PRINCIPLES:
          1. COORDINATE SYSTEM: Y is UP. X is LEFT/RIGHT. Z is FRONT/BACK.
          2. AUTOMATIC GROUNDING: The system will automatically shift the entire object so its lowest point rests on the floor (Y=0). Focus on internal relative positioning.
          3. SCALE & PROPORTIONS:
             - Use a human scale as reference (1.73m height).
             - The floor grid is 1x1 meter.
             - Ensure harmony and realistic proportions between all created objects.
             - PUPILS (PUPILAS): Must be very small spheres, typically 10-20% of the eye's scale (e.g., if eye is 0.2, pupil should be 0.03).
          4. HIERARCHY & RELATIVE POSITIONING (CRITICAL):
             - Use the "parent" property to create a logical tree.
             - IMPORTANT: The "parent" MUST be the "tag" of another physical part in the "parts" array.
             - FOLDERS: ALWAYS use the "folder" property for new improvements (e.g., "Mejora: Ojos"). NEVER use folder names as parents.
             - RELATIVE POSITION: If a part has a "parent", its "position" MUST be RELATIVE to that parent's center.
             - Example: If the head is at [0, 2, 0] and the eye is on the head, the eye's position should be something like [0.2, 0.1, 0.5], NOT [0.2, 2.1, 0.5].
             - Pupils MUST be relative to the eye. If an eye is at [0.3, 0, 0.5], the pupil should be at [0, 0, 0.1] relative to the eye.
             - SCALE INDEPENDENCE: Parent scale does NOT affect child scale. Use absolute scales for all parts.
          4. ARTICULATIONS & PIVOTS: For robots or creatures, you MUST use explicit joints.
             - A leg should be: hip_joint (sphere) -> thigh (capsule/box) -> knee_joint (sphere) -> shin (capsule/box) -> ankle_joint (sphere) -> foot (box).
             - PIVOT CALCULATION: All primitives are centered at their local [0,0,0]. 
               - To attach a part of height H to a parent joint, set its relative position to [0, -H/2, 0].
               - To attach a child joint to the bottom of that part, set the child joint's relative position to [0, -H/2, 0] (relative to the part).
             - MECHANICAL PRECISION: Ensure parts are physically connected. No floating parts.
          5. SYMMETRY: Ensure bilateral symmetry for pairs (left/right). Mirror X positions exactly.
          6. DETAIL: Use multiple primitives to create complex shapes.
          
          2. "suggestions": An array of up to 10 creative and logical suggestions to improve this specific object. 
             Each suggestion must be an object with "text" and "consciousnessScore" (0-5).
             Focus on functional completeness (e.g., "Añadir articulaciones en los codos", "Incorporar un panel de control").` }] }
      ];

  onDebug?.(`Enviando petición a Gemini API (${modelName}, Tiempo límite: 90s)...`);
  const startTime = Date.now();

  const timeoutPromise = new Promise<never>((_, reject) => 
    setTimeout(() => reject(new Error("La petición ha excedido el tiempo límite (90s).")), 90000)
  );

  try {
    const apiCall = ai.models.generateContent({
      model: modelName,
      contents: contents,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            parts: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  type: { type: Type.STRING, enum: ['box', 'sphere', 'cylinder', 'cone', 'torus', 'capsule'] },
                  color: { type: Type.STRING },
                  position: { type: Type.ARRAY, items: { type: Type.NUMBER }, minItems: 3, maxItems: 3 },
                  scale: { type: Type.ARRAY, items: { type: Type.NUMBER }, minItems: 3, maxItems: 3 },
                  rotation: { type: Type.ARRAY, items: { type: Type.NUMBER }, minItems: 3, maxItems: 3 },
                  tag: { type: Type.STRING },
                  parent: { type: Type.STRING },
                  folder: { type: Type.STRING },
                },
                required: ['type', 'color', 'position', 'scale', 'rotation', 'tag'],
              },
            },
            suggestions: { 
              type: Type.ARRAY, 
              items: { 
                type: Type.OBJECT,
                properties: {
                  text: { type: Type.STRING },
                  consciousnessScore: { type: Type.NUMBER }
                },
                required: ['text', 'consciousnessScore']
              } 
            },
          },
          required: ['parts', 'suggestions'],
        },
      },
    });

    const response = await Promise.race([apiCall, timeoutPromise]);

    const duration = Date.now() - startTime;
    onDebug?.(`Respuesta recibida en ${duration}ms. Procesando JSON...`);

    const result = JSON.parse(response.text);
    onDebug?.(`Generación completada en ${duration}ms. Se crearon/actualizaron ${result.parts.length} primitivas.`);
    return result;
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    
    if (errorMsg.toLowerCase().includes("quota") || errorMsg.includes("429")) {
      onDebug?.("⚠️ ERROR DE CUOTA: Has excedido el límite de peticiones de la API.");
    } else if (errorMsg.includes("timeout") || errorMsg.includes("tiempo límite")) {
      onDebug?.("⏳ ERROR DE TIEMPO: La API está tardando demasiado.");
    } else {
      onDebug?.(`❌ ERROR: ${errorMsg}`);
    }
    
    console.error("Gemini API Error:", e);
    throw e;
  }
}
