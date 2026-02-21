# Simulador Solar

Herramienta web para simular y comparar el impacto económico de una instalación fotovoltaica en el mercado eléctrico español. Funciona completamente en el navegador — sin servidor, sin cuenta, sin datos enviados a ningún lado.

## Funcionalidades

- **Importación de consumos** desde ficheros CSV de distribuidoras españolas (formato REE/CNMC)
- **Datos de producción solar** obtenidos de la API de [PVGIS](https://re.jrc.ec.europa.eu/pvg_tools/) (JRC/Comisión Europea)
- **Simulación horaria** de autoconsumo, batería física y excedentes
- **Cálculo de factura** según tarifa 2.0TD (periodos punta/llano/valle), tarifa plana o tarifas personalizadas
- **Precios PVPC** en tiempo real desde la API de REE
- **Batería virtual** con compensación mensual acumulada
- **Comparador de ofertas** de comercializadoras con desglose mensual
- **Sombras** por obstáculos configurables (edificios, árboles…) con factor de sombreado horario
- **Rentabilidad de batería**: años de amortización calculados automáticamente si se especifica el precio

## Stack

- [Vite](https://vitejs.dev/) + [React](https://react.dev/) + TypeScript
- [MUI](https://mui.com/) (Material UI)
- [Recharts](https://recharts.org/)
- [Dexie.js](https://dexie.org/) (IndexedDB — todos los datos se almacenan localmente en el navegador)

## Uso

```bash
pnpm install
pnpm dev
```

El build genera un único fichero `dist/index.html` autocontenido (JS y CSS inlineados) que puede abrirse directamente en el navegador sin servidor.

```bash
pnpm build
```

## Notas

- Los datos de consumo y configuración se almacenan en IndexedDB del navegador. No se envía nada a ningún servidor.
- Los datos de PVGIS se obtienen de la API pública de la Comisión Europea.
- Los precios PVPC se obtienen de la API pública de REE ([apidatos.ree.es](https://apidatos.ree.es)).
