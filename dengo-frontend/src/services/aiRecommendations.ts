/**
 * Servicio de Recomendaciones con IA
 *
 * Opciones de configuración:
 * 1. Claude (Anthropic) - Mejor calidad, costo medio
 * 2. OpenAI (GPT) - Muy buena calidad, costo variable
 * 3. Gemini (Google) - Tier gratuito disponible
 */

// Tipo de proveedor de IA
type AIProvider = 'claude' | 'openai' | 'gemini' | 'local';

interface AIConfig {
  provider: AIProvider;
  apiKey?: string;
  model?: string;
}

interface ReportData {
  type: 'sales' | 'inventory' | 'cash' | 'products';
  data: any;
  context?: string;
}

interface AIRecommendation {
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  category: 'inventory' | 'pricing' | 'marketing' | 'operations';
  actionable: boolean;
}

/**
 * Servicio de recomendaciones con IA
 */
export class AIRecommendationService {
  private config: AIConfig;

  constructor(config: AIConfig) {
    this.config = config;
  }

  /**
   * Obtener recomendaciones basadas en datos del reporte
   */
  async getRecommendations(reportData: ReportData): Promise<AIRecommendation[]> {
    switch (this.config.provider) {
      case 'claude':
        return this.getClaudeRecommendations(reportData);
      case 'openai':
        return this.getOpenAIRecommendations(reportData);
      case 'gemini':
        return this.getGeminiRecommendations(reportData);
      case 'local':
        return this.getLocalRecommendations(reportData);
      default:
        throw new Error(`Proveedor de IA no soportado: ${this.config.provider}`);
    }
  }

  /**
   * Claude (Anthropic) - Recomendado
   */
  private async getClaudeRecommendations(reportData: ReportData): Promise<AIRecommendation[]> {
    try {
      // Importar dinámicamente el SDK
      const { default: Anthropic } = await import('@anthropic-ai/sdk');

      const anthropic = new Anthropic({
        apiKey: this.config.apiKey || process.env.VITE_ANTHROPIC_API_KEY,
      });

      const prompt = this.buildPrompt(reportData);

      const message = await anthropic.messages.create({
        model: this.config.model || "claude-3-5-haiku-20241022",
        max_tokens: 1500,
        messages: [{
          role: "user",
          content: prompt
        }]
      });

      const response = message.content[0].type === 'text' ? message.content[0].text : '';
      return this.parseRecommendations(response);
    } catch (error) {
      console.error('Error obteniendo recomendaciones de Claude:', error);
      return this.getFallbackRecommendations(reportData);
    }
  }

  /**
   * OpenAI (GPT)
   */
  private async getOpenAIRecommendations(reportData: ReportData): Promise<AIRecommendation[]> {
    try {
      const { default: OpenAI } = await import('openai');

      const openai = new OpenAI({
        apiKey: this.config.apiKey || process.env.VITE_OPENAI_API_KEY,
        dangerouslyAllowBrowser: true // Solo para desarrollo
      });

      const prompt = this.buildPrompt(reportData);

      const completion = await openai.chat.completions.create({
        model: this.config.model || "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 1500,
      });

      const response = completion.choices[0]?.message?.content || '';
      return this.parseRecommendations(response);
    } catch (error) {
      console.error('Error obteniendo recomendaciones de OpenAI:', error);
      return this.getFallbackRecommendations(reportData);
    }
  }

  /**
   * Google Gemini - Opción GRATUITA
   */
  private async getGeminiRecommendations(reportData: ReportData): Promise<AIRecommendation[]> {
    try {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');

      const genAI = new GoogleGenerativeAI(
        this.config.apiKey || process.env.VITE_GEMINI_API_KEY || ''
      );

      const model = genAI.getGenerativeModel({
        model: this.config.model || "gemini-1.5-flash"
      });

      const prompt = this.buildPrompt(reportData);
      const result = await model.generateContent(prompt);
      const response = result.response.text();

      return this.parseRecommendations(response);
    } catch (error) {
      console.error('Error obteniendo recomendaciones de Gemini:', error);
      return this.getFallbackRecommendations(reportData);
    }
  }

  /**
   * Recomendaciones locales (basadas en reglas)
   */
  private getLocalRecommendations(reportData: ReportData): AIRecommendation[] {
    const recommendations: AIRecommendation[] = [];

    // Reglas básicas sin IA
    if (reportData.type === 'inventory') {
      const lowStock = reportData.data.lowStock || [];
      if (lowStock.length > 0) {
        recommendations.push({
          title: 'Productos con Stock Bajo',
          description: `Tienes ${lowStock.length} productos por debajo del stock mínimo. Considera hacer un pedido urgente para evitar pérdida de ventas.`,
          priority: 'high',
          category: 'inventory',
          actionable: true
        });
      }

      const overstock = reportData.data.overstock || [];
      if (overstock.length > 0) {
        recommendations.push({
          title: 'Productos con Exceso de Inventario',
          description: `${overstock.length} productos tienen inventario excesivo. Considera promociones o descuentos para aumentar su rotación.`,
          priority: 'medium',
          category: 'pricing',
          actionable: true
        });
      }
    }

    if (reportData.type === 'sales') {
      const lowPerformers = reportData.data.lowPerformers || [];
      if (lowPerformers.length > 0) {
        recommendations.push({
          title: 'Productos de Baja Rotación',
          description: `${lowPerformers.length} productos tienen ventas muy bajas. Considera reposicionarlos en áreas de mayor visibilidad o crear ofertas especiales.`,
          priority: 'medium',
          category: 'marketing',
          actionable: true
        });
      }
    }

    return recommendations;
  }

  /**
   * Construir el prompt para la IA
   */
  private buildPrompt(reportData: ReportData): string {
    const basePrompt = `Eres un experto consultor de retail con experiencia en optimización de inventarios y ventas.

Analiza los siguientes datos y proporciona 3-5 recomendaciones ESPECÍFICAS, ACCIONABLES y PRIORIZADAS:

Tipo de Reporte: ${reportData.type}
Contexto Adicional: ${reportData.context || 'N/A'}

Datos:
${JSON.stringify(reportData.data, null, 2)}

Para cada recomendación, proporciona:
1. Título corto y claro
2. Descripción detallada (2-3 líneas)
3. Prioridad (high/medium/low)
4. Categoría (inventory/pricing/marketing/operations)

Responde en formato JSON:
[
  {
    "title": "...",
    "description": "...",
    "priority": "high|medium|low",
    "category": "inventory|pricing|marketing|operations"
  }
]`;

    return basePrompt;
  }

  /**
   * Parsear las recomendaciones de la respuesta de la IA
   */
  private parseRecommendations(response: string): AIRecommendation[] {
    try {
      // Intentar extraer JSON de la respuesta
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return parsed.map((rec: any) => ({
          ...rec,
          actionable: true
        }));
      }

      // Si no hay JSON, intentar parsear texto
      return this.parseTextRecommendations(response);
    } catch (error) {
      console.error('Error parseando recomendaciones:', error);
      return [];
    }
  }

  /**
   * Parsear recomendaciones de texto plano
   */
  private parseTextRecommendations(text: string): AIRecommendation[] {
    // Implementación simple de parseo de texto
    const lines = text.split('\n').filter(line => line.trim());
    const recommendations: AIRecommendation[] = [];

    let currentRec: Partial<AIRecommendation> = {};

    for (const line of lines) {
      if (line.match(/^\d+\./)) {
        if (currentRec.title) {
          recommendations.push(currentRec as AIRecommendation);
        }
        currentRec = {
          title: line.replace(/^\d+\.\s*/, ''),
          priority: 'medium',
          category: 'operations',
          actionable: true
        };
      } else if (currentRec.title && !currentRec.description) {
        currentRec.description = line.trim();
      }
    }

    if (currentRec.title) {
      recommendations.push(currentRec as AIRecommendation);
    }

    return recommendations;
  }

  /**
   * Recomendaciones de respaldo si falla la IA
   */
  private getFallbackRecommendations(reportData: ReportData): AIRecommendation[] {
    return this.getLocalRecommendations(reportData);
  }
}

/**
 * Instancia singleton del servicio
 */
let aiService: AIRecommendationService | null = null;

export function getAIService(config?: AIConfig): AIRecommendationService {
  if (!aiService) {
    // Configuración por defecto: usar Gemini (gratis) o reglas locales
    const defaultConfig: AIConfig = {
      provider: (process.env.VITE_AI_PROVIDER as AIProvider) || 'gemini',
      apiKey: process.env.VITE_AI_API_KEY,
      model: process.env.VITE_AI_MODEL
    };

    aiService = new AIRecommendationService(config || defaultConfig);
  }

  return aiService;
}

/**
 * Hook de React para usar recomendaciones de IA
 */
export function useAIRecommendations() {
  const [loading, setLoading] = useState(false);
  const [recommendations, setRecommendations] = useState<AIRecommendation[]>([]);
  const [error, setError] = useState<string | null>(null);

  const generateRecommendations = async (reportData: ReportData) => {
    setLoading(true);
    setError(null);

    try {
      const aiService = getAIService();
      const recs = await aiService.getRecommendations(reportData);
      setRecommendations(recs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error generando recomendaciones');
      setRecommendations([]);
    } finally {
      setLoading(false);
    }
  };

  return { recommendations, loading, error, generateRecommendations };
}

// Importar useState
import { useState } from 'react';
