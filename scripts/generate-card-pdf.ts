/**
 * Generate PDF from AI Tactic Cards HTML
 *
 * Uses Puppeteer for headless PDF generation.
 * Falls back to instructions for browser-based export if Puppeteer is unavailable.
 *
 * Usage:
 *   pnpm export:cards                     # generates tactic-cards.pdf
 *   pnpm export:cards ./output/cards.pdf  # custom output path
 */

import * as path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.resolve(__dirname, '..')

async function generatePDF() {
  const outputPath = process.argv[2] || path.join(ROOT, 'tactic-cards.pdf')
  const htmlPath = path.join(ROOT, 'ai-tactic-cards.html')

  let puppeteer: any
  try {
    puppeteer = await import('puppeteer')
  } catch {
    console.log(`
  Puppeteer is not installed. Two options:

  1. Install Puppeteer and re-run:
     npm install puppeteer
     pnpm export:cards

  2. Use your browser (recommended):
     a. Open ai-tactic-cards.html in Chrome/Edge
     b. Check "Print-friendly" toggle for light mode (saves ink)
     c. Press Ctrl+P (or Cmd+P on Mac)
     d. Set Destination to "Save as PDF"
     e. Set Paper size to 4x6 or Letter
     f. Enable "Background graphics"
     g. Save

  The HTML has @media print CSS that puts each card on its own page.
`)
    process.exit(0)
  }

  console.log('  Launching headless browser...')
  const browser = await puppeteer.default.launch({ headless: true })
  const page = await browser.newPage()

  const fileUrl = `file://${htmlPath}`
  await page.goto(fileUrl, { waitUntil: 'networkidle2' })

  // Enable print-friendly mode for cleaner PDF
  await page.evaluate(() => {
    document.body.classList.add('print-friendly')
  })

  // Wait for styles to apply
  await new Promise(r => setTimeout(r, 500))

  console.log('  Generating PDF...')
  await page.pdf({
    path: outputPath,
    format: 'Letter',
    margin: { top: '0.5in', bottom: '0.5in', left: '0.75in', right: '0.75in' },
    printBackground: true,
  })

  await browser.close()
  console.log(`  PDF generated: ${outputPath}`)
}

generatePDF().catch(err => {
  console.error('PDF generation failed:', err)
  process.exit(1)
})
