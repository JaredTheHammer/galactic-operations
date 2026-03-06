const http = require('http')
const fs = require('fs')
const path = require('path')

const REPORTS_DIR = path.join(__dirname, '..', 'reports')
const PORT = 5175

const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.csv': 'text/csv',
  '.txt': 'text/plain',
}

http.createServer((req, res) => {
  const url = req.url === '/' ? '/balance-weapons.html' : req.url
  const filePath = path.join(REPORTS_DIR, url)
  const ext = path.extname(filePath)

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' })
      res.end('Not found: ' + url)
    } else {
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' })
      res.end(data)
    }
  })
}).listen(PORT, () => {
  console.log(`Reports server running at http://localhost:${PORT}`)
})
