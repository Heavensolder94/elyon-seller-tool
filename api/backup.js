// /api/backup.js
import { Upstash } from '@upstash/redis';

// Initialisiere Upstash mit deinen Environment Variables
const upstash = new Upstash({
  url: process.env.UPSTASH_BACKUP_URL,
  token: process.env.UPSTASH_BACKUP_TOKEN,
});

export default async function handler(req, res) {
  // Nur POST erlaubt
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Nur POST erlaubt' });
  }

  try {
    const { data, timestamp } = req.body;

    // Validierung
    if (!data || !timestamp) {
      return res.status(400).json({ error: 'Fehlende Daten oder Timestamp' });
    }

    // Speichere Backup in Upstash
    const key = `elyon_backup_${timestamp}`;
    await upstash.set(key, JSON.stringify(data));

    // Alte Backups bereinigen (nur letzte 30 Tage behalten)
    const allKeys = await upstash.keys('elyon_backup_*');
    const now = Date.now();

    for (const oldKey of allKeys) {
      const oldTimestamp = oldKey.split('_')[2].split('T')[0];
      const oldDate = new Date(oldTimestamp).getTime();
      if (now - oldDate > 30 * 24 * 60 * 60 * 1000) { // 30 Tage
        await upstash.del(oldKey);
      }
    }

    // Erfolg
    res.status(200).json({
      success: true,
      key,
      message: 'Backup erfolgreich in Upstash gespeichert',
      timestamp,
    });
  } catch (error) {
    console.error('❌ Backup-Fehler:', error);
    res.status(500).json({
      error: 'Backup fehlgeschlagen',
      details: error.message,
    });
  }
}
