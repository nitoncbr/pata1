require('dotenv').config();

const fs = require('fs');
const path = require('path');

async function getScanPage(req, res) {
  try {
    const htmlPath = path.join(__dirname, '..', 'public', 'scan.html');
    const rawHtml = await fs.promises.readFile(htmlPath, 'utf8');

    const payload = req.pataData || {
      state: 'inactive',
      object_type: null,
      object_label: null,
      uid: req.params ? req.params.uid : undefined,
    };

    const scriptTag = `<script>window.__PATA__ = ${JSON.stringify(
      payload,
    )};</script>`;

    const marker = '<script>';
    let finalHtml;

    if (rawHtml.includes(marker)) {
      finalHtml = rawHtml.replace(marker, `${scriptTag}\n${marker}`);
    } else {
      finalHtml = `${rawHtml}\n${scriptTag}`;
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(finalHtml);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Error serving scan page:', err);
    return res.status(500).send('Internal Server Error');
  }
}

module.exports = {
  getScanPage,
};

