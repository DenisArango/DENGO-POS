# Guía de Integración de IA en DENGO POS

## 📊 Opciones de IA y Costos

### Opción 1: Google Gemini ⭐ RECOMENDADO PARA EMPEZAR
- **Costo**: GRATIS hasta 15 requests/minuto
- **Modelo**: `gemini-1.5-flash`
- **Ventajas**:
  - Tier gratuito generoso
  - Excelente calidad
  - Fácil de configurar
- **Límites**: 15 RPM, 1M TPM, 1500 RPD
- **Documentación**: https://ai.google.dev/gemini-api/docs

### Opción 2: Claude (Anthropic)
- **Costo**: $3-15 USD por millón de tokens
- **Modelo**: `claude-3-5-haiku-20241022` (económico)
- **Ventajas**:
  - Mejor en análisis contextual
  - Excelente para recomendaciones
  - Respuestas más estructuradas
- **Costo estimado**: $5-20/mes para uso moderado
- **Documentación**: https://docs.anthropic.com/

### Opción 3: OpenAI (GPT)
- **Costo**: $0.50-15 USD por millón de tokens
- **Modelo**: `gpt-4o-mini` (económico)
- **Ventajas**:
  - Muy conocido y bien documentado
  - Gran ecosistema
- **Costo estimado**: $5-25/mes
- **Documentación**: https://platform.openai.com/docs

### Opción 4: Local (Reglas)
- **Costo**: GRATIS
- **Funcionalidad**: Recomendaciones basadas en reglas predefinidas
- **Ventajas**:
  - Sin costos
  - Sin dependencias externas
  - Respuesta instantánea
- **Desventajas**:
  - Menos inteligente
  - Requiere mantenimiento manual

---

## 🚀 Configuración Paso a Paso

### 1. Instalar Dependencias

```bash
# Para Gemini (GRATIS - Recomendado)
npm install @google/generative-ai

# Para Claude
npm install @anthropic-ai/sdk

# Para OpenAI
npm install openai
```

### 2. Configurar Variables de Entorno

Crear o actualizar `.env`:

```env
# Opción A: Gemini (Gratis)
VITE_AI_PROVIDER=gemini
VITE_GEMINI_API_KEY=tu_api_key_aqui

# Opción B: Claude
# VITE_AI_PROVIDER=claude
# VITE_ANTHROPIC_API_KEY=tu_api_key_aqui

# Opción C: OpenAI
# VITE_AI_PROVIDER=openai
# VITE_OPENAI_API_KEY=tu_api_key_aqui

# Opción D: Local (sin IA)
# VITE_AI_PROVIDER=local
```

### 3. Obtener API Keys

#### Gemini (Gratis):
1. Ir a: https://makersuite.google.com/app/apikey
2. Crear proyecto (si no existe)
3. Crear API Key
4. Copiar y pegar en `.env`

#### Claude:
1. Ir a: https://console.anthropic.com/
2. Crear cuenta
3. Settings → API Keys
4. Copiar key

#### OpenAI:
1. Ir a: https://platform.openai.com/api-keys
2. Crear cuenta
3. Create new secret key
4. Copiar key

### 4. Usar en los Reportes

```typescript
import AIRecommendations from '@/components/reports/AIRecommendations'

export default function MyReport() {
  const reportData = {
    type: 'inventory' as const,
    data: {
      lowStock: [...],
      overstock: [...],
      topProducts: [...]
    },
    context: 'Reporte semanal de inventario'
  }

  return (
    <div>
      {/* Tu reporte aquí */}

      {/* Recomendaciones de IA */}
      <AIRecommendations
        reportData={reportData}
        autoGenerate={true}  // Genera automáticamente al cargar
      />
    </div>
  )
}
```

---

## 💡 Ejemplos de Recomendaciones que Genera

### Para Reportes de Inventario:
- "Producto X tiene stock bajo y alta demanda. Aumentar pedido en un 30%"
- "5 productos llevan 60+ días sin movimiento. Considerar promoción 2x1"
- "Stock de Y excede demanda anual. Reducir espacio de almacenamiento"

### Para Reportes de Ventas:
- "Ventas bajan 15% los martes. Crear promoción 'Martes de descuento'"
- "Producto Z se vende más entre 2-4pm. Moverlo a zona de alto tráfico"
- "Cliente ABC no compra hace 30 días. Enviar oferta personalizada"

### Para Reportes de Caja:
- "Diferencias recurrentes en turno nocturno. Revisar procedimientos"
- "Alto uso de efectivo. Incentivar pagos digitales con 2% descuento"
- "Faltantes de $50-100 semanales. Implementar auditoría diaria"

---

## 📊 Estimación de Costos Reales

### Ejemplo de Uso Moderado:
- 10 reportes con IA por día
- Promedio 500 tokens por request
- ~15,000 tokens/mes

**Costos:**
- **Gemini**: GRATIS ✅
- **Claude Haiku**: ~$0.05/mes
- **GPT-4o-mini**: ~$0.10/mes

### Ejemplo de Uso Intensivo:
- 100 reportes con IA por día
- Promedio 1000 tokens por request
- ~3M tokens/mes

**Costos:**
- **Gemini**: GRATIS (con límites) ✅
- **Claude Haiku**: ~$10/mes
- **GPT-4o-mini**: ~$15/mes

---

## 🔒 Seguridad y Buenas Prácticas

### ⚠️ IMPORTANTE: API Keys

1. **NUNCA** expongas API keys en el código frontend
2. **Usa un backend** para hacer las llamadas a IA
3. **Implementa rate limiting**
4. **Monitorea costos**

### Arquitectura Recomendada:

```
Frontend (React)
    ↓
Backend API (Node.js/Express)
    ↓
Servicio de IA (Claude/OpenAI/Gemini)
```

### Ejemplo de Backend Seguro:

```typescript
// backend/routes/ai.ts
import express from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';

const router = express.Router();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

router.post('/recommendations', async (req, res) => {
  try {
    const { reportData } = req.body;

    // Validar usuario autenticado
    if (!req.user) {
      return res.status(401).json({ error: 'No autorizado' });
    }

    // Rate limiting (implementar con express-rate-limit)

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent(buildPrompt(reportData));

    res.json({
      recommendations: parseRecommendations(result.response.text())
    });
  } catch (error) {
    res.status(500).json({ error: 'Error generando recomendaciones' });
  }
});

export default router;
```

---

## 🎯 Mejores Prácticas

### 1. Cache de Resultados
```typescript
// Guardar recomendaciones por 24 horas
const cacheKey = `recs_${reportType}_${date}`;
const cached = localStorage.getItem(cacheKey);

if (cached) {
  return JSON.parse(cached);
}

const recs = await generateRecommendations(data);
localStorage.setItem(cacheKey, JSON.stringify(recs));
```

### 2. Fallback a Reglas Locales
Si la IA falla, el sistema automáticamente usa reglas predefinidas.

### 3. Feedback del Usuario
Permite que usuarios califiquen las recomendaciones para mejorar.

### 4. Prompts Específicos por Negocio
Personaliza los prompts según el tipo de negocio:
- Farmacia
- Ferretería
- Supermercado
- Restaurante

---

## 📈 Siguiente Nivel: Análisis Predictivo

### Funcionalidades Avanzadas (Futuro):
1. **Predicción de Demanda**: "En 2 semanas necesitarás 50% más de producto X"
2. **Detección de Fraude**: "Patrón inusual en ventas del turno nocturno"
3. **Optimización de Precios**: "Reducir 5% precio de Y aumentaría ventas 20%"
4. **Análisis de Competencia**: Integrar datos externos
5. **Personalización por Cliente**: Ofertas individualizadas

---

## 🆘 Troubleshooting

### Error: "API Key inválida"
- Verificar que la key esté correcta en `.env`
- Verificar que el archivo `.env` esté en la raíz
- Reiniciar el servidor de desarrollo

### Error: "Rate limit exceeded"
- Usar tier de pago
- Implementar caché
- Reducir frecuencia de llamadas

### Recomendaciones pobres
- Mejorar el prompt con más contexto
- Usar modelo más avanzado
- Proporcionar más datos en el reporte

---

## 📞 Soporte

Para dudas o problemas:
1. Revisar documentación oficial del proveedor
2. Verificar logs de error en consola
3. Probar con el modo 'local' primero
