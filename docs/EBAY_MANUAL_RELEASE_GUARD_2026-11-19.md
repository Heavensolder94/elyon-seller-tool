# Manuelle eBay-Veröffentlichung

Im bestehenden Seller-Tool-Publishing-Panel bleibt der Auto-Live-Schalter sichtbar, aber deaktiviert. Auch ein zuvor gespeicherter aktivierter Wert wird beim Erstellen eines Entwurfs nicht ausgeführt. Die vorhandenen Einstellungen werden nicht gelöscht. Der einzelne Button zur Veröffentlichung behält seine ausdrückliche Bestätigung und die bestehenden serverseitigen Prüfungen.

Die Änderung betrifft den bekannten Browser-Pfad. Sie belegt nicht, dass andere Clients oder ein veralteter Browsercache nicht eigenständig die bestehende Publish-API ansprechen können. Der API-Bestätigungstext allein ist kein Nachweis einer menschlichen Einzelbestätigung. JARVIS-Texte und weitere mögliche Aufrufer sind gesondert auf die aktuelle Draft-first-Regel zu prüfen.

Keine API-, Storage-Key- oder Datenmigration. Rollback per Revert; danach gilt die bisherige Auto-Live-Logik wieder.
