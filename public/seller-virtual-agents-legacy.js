'use strict';
(function(){
  const STORAGE_KEY = 'elyon_ai_agents_settings';
  const AGENT_DEFS = [
    {
      id: 'soul-scout',
      group: 'ki-agents',
      name: 'Soul Scout',
      icon: '🛰️',
      task: 'Produktideen & Chancen erkennen',
      accent: 'scout',
      connections: ['Produktanalyse', 'Trend-Erkennung', 'Ideenprüfung'],
      description: 'Analysiert neue Produktideen, erkennt Nachfrage, prüft Trend-Potenzial und markiert Chancen oder Nischen, die sich für einen Test eignen. Gibt nur Hinweise und sortiert Ideen nach Potenzial.',
      prompt: 'Analysiere Produktideen datenbasiert, priorisiere nach Nachfrage, Wettbewerb und Marge und liefere eine klare Empfehlung mit den nächsten 3 Testschritten.',
      promptTemplates: [
        'Prüfe diese Produktidee auf Nachfrage, Wettbewerb, Risiko und Startmarge. Gib am Ende eine klare Entscheidung: Testen, Beobachten oder Verwerfen.',
        'Erstelle eine Chancenanalyse mit Trend-Signal, Zielgruppe, Preisfenster und grobem Aufwand. Füge eine kurze To-do-Liste für den nächsten Schritt hinzu.',
        'Bewerte das Produkt aus Seller-Sicht mit Fokus auf Potenzial, Risiken und Umsetzbarkeit und schreibe eine priorisierte Handlungsempfehlung.',
      ],
    },
    {
      id: 'soul-seo',
      group: 'ki-agents',
      name: 'Soul SEO',
      icon: '🔎',
      task: 'Titel, Beschreibung, Keywords verbessern',
      accent: 'seo',
      connections: ['OpenAI Listing KI', 'Titelgenerator', 'Beschreibungsgenerator'],
      description: 'Optimiert Titel, Beschreibung und Keywords für Sichtbarkeit, Klickrate und Conversion. Prüft Formulierungen auf Klarheit, Relevanz und eBay-Tauglichkeit.',
      prompt: 'Optimiere Listing-Titel, Keywords und Beschreibung für Sichtbarkeit und Conversion und beachte klare, regelkonforme Formulierungen für eBay.',
      promptTemplates: [
        'Erstelle einen SEO-optimierten Titel, 8 passende Keywords und eine strukturierte Kurzbeschreibung für eBay. Fokus: Relevanz, Klickrate, Lesbarkeit.',
        'Überarbeite das bestehende Listing mit klaren Suchbegriffen, besserem Nutzenversprechen und sauberer Struktur ohne Keyword-Stuffing.',
        'Liefere eine SEO-Analyse mit konkreten Verbesserungen für Titel, Bullet-Points und Beschreibung sowie einer priorisierten Umsetzungsreihenfolge.',
      ],
    },
    {
      id: 'soul-guard',
      group: 'ki-agents',
      name: 'Soul Guard',
      icon: '🛡️',
      task: 'Risiken, Marge, Lieferzeit und EPR-Hinweise prüfen',
      accent: 'guard',
      connections: ['Produktanalyse', 'Margenprüfung', 'EPR-Hinweise'],
      description: 'Prüft Risiko, Marge, Lieferzeit, Compliance und EPR-/WEEE-Hinweise. Warnt vor problematischen Produkten und markiert Dinge, die vor einem Listing geprüft werden sollten.',
      prompt: 'Führe eine Risiko- und Compliance-Prüfung durch und markiere kritische Punkte mit klaren Gegenmaßnahmen vor einer Freigabe.',
      promptTemplates: [
        'Prüfe dieses Produkt auf Lieferzeit-Risiko, Marge, rechtliche Hinweise und potenzielle Sperrgründe. Markiere kritische Punkte eindeutig.',
        'Erstelle einen Risiko-Report mit Ampellogik (grün/gelb/rot), Begründung und konkreten Maßnahmen, die vor dem Listing erledigt werden müssen.',
        'Bewerte Compliance und Wirtschaftlichkeit gemeinsam und gib eine Freigabeempfehlung nur bei nachvollziehbar niedriger Risikolage.',
      ],
    },
    {
      id: 'soul-finance',
      group: 'virtual-ma',
      name: 'Soul Finance',
      icon: '💶',
      task: 'Gewinn, Gebühren, Break-even und Cashflow bewerten',
      accent: 'finance',
      connections: ['Gewinnrechner', 'Gebühren-Check', 'Cashflow-Modul'],
      description: 'Bewertet Gewinn, Gebühren, Break-even, Cashflow und Preisstabilität. Zeigt, ob ein Produkt wirtschaftlich sinnvoll ist und wo die Kosten schnell zu hoch werden.',
      prompt: 'Berechne die Wirtschaftlichkeit mit Gebühren, Marge, Break-even und Cashflow und gib eine klare Entscheidung mit Begründung.',
      promptTemplates: [
        'Analysiere Einkauf, Gebühren, Versand und Zielpreis. Berechne Marge und Break-even und gib eine klare Empfehlung zur Preisstrategie.',
        'Erstelle eine Finanzbewertung mit Best-Case, Real-Case und Worst-Case inklusive Warnhinweisen bei knapper Marge.',
        'Prüfe, ob das Produkt finanziell tragfähig ist, und nenne die wichtigsten Hebel zur Margenverbesserung in priorisierter Reihenfolge.',
      ],
    },
    {
      id: 'soul-support',
      group: 'virtual-ma',
      name: 'Soul Support',
      icon: '💬',
      task: 'Kundenantworten und Retouren-Kommunikation vorbereiten',
      accent: 'support',
      connections: ['Elyon Soul / Coach', 'Antwortvorlagen', 'Retouren-Workflow'],
      description: 'Formuliert freundliche Kundenantworten, Retouren-Kommunikation und Eskalationshinweise. Hilft, schnell und professionell zu antworten, ohne unüberlegte Zusagen zu machen.',
      prompt: 'Schreibe kundenfreundliche, klare und sichere Antworten mit passender Eskalation, ohne riskante Zusagen oder unklare Aussagen.',
      promptTemplates: [
        'Formuliere eine empathische Kundenantwort mit klarer Lösung, nächstem Schritt und professionellem Ton. Vermeide unklare Versprechen.',
        'Erstelle eine Antwortvorlage für Reklamation oder Retoure mit kurzer Prüfung, sauberer Struktur und nachvollziehbarer Eskalationsoption.',
        'Gib eine Support-Antwort mit Fokus auf Klarheit, Kulanzrahmen und Verbindlichkeit, damit der Kunde sofort weiß, was als Nächstes passiert.',
      ],
    },
    {
      id: 'soul-operations',
      group: 'virtual-ma',
      name: 'Soul Operations',
      icon: '📋',
      task: 'Tagesfokus, offene Aufgaben und Warnungen erstellen',
      accent: 'operations',
      connections: ['Tagesfokus', 'Aufgabenboard', 'Warnlogik'],
      description: 'Erstellt Tagesfokus, offene Aufgaben und Warnungen aus den laufenden Vorgängen. Priorisiert die wichtigsten To-dos und zeigt, wo du heute hinschauen solltest.',
      prompt: 'Erzeuge einen klaren Tagesplan mit Prioritäten, Abhängigkeiten und Warnungen, damit operative Aufgaben strukturiert abgearbeitet werden.',
      promptTemplates: [
        'Erstelle einen Tagesfokus mit Top-3 Prioritäten, offenen Blockern und nächsten Schritten inklusive Zeitempfehlung.',
        'Baue aus den aktuellen Vorgängen eine umsetzbare Aufgabenliste mit Reihenfolge, Verantwortlichkeit und Risikohinweisen.',
        'Fasse operative Warnungen zusammen und formuliere einen klaren Ablaufplan, der heute realistisch abgearbeitet werden kann.',
      ],
    },
  ];
  const EXTENDED_AUTONOMY_FEATURE_DEFS = [
    {
      id: 'auto-actions',
      kind: 'feature',
      icon: '⚙️',
      title: 'Vollautomatische Aktionen',
      description: 'Agenten können künftig Abläufe selbst vorbereiten und mit Freigabe ausführen, statt nur Hinweise zu geben.',
      config: {
        targetArea: 'ki-agents',
        mode: 'manual',
        threshold: 'medium',
        autoStart: false,
        prompt: 'Prüfe die passende KI-Aufgabe auf Risiken, Zielbereich und sinnvolle nächste Schritte.',
        note: 'Mit Bestätigung freigeben',
      },
      promptTemplates: [
        'Prüfe die passende KI-Aufgabe auf Risiken, Zielbereich und sinnvolle nächste Schritte.',
        'Formuliere eine sichere Ausführungsvorlage mit Prüfschritten und Freigabepunkt.',
        'Erstelle eine kompakte Ablaufempfehlung für den nächsten autonomen Schritt.',
      ],
    },
    {
      id: 'auto-orders',
      kind: 'feature',
      icon: '🔒',
      title: 'Automatische Bestellungen',
      description: 'Bestellungen werden später aus gespeicherten Bestellplänen vorbereitet und erst nach Freigabe ausgelöst.',
      config: {
        targetArea: 'virtual-ma',
        mode: 'manual',
        threshold: 'high',
        autoStart: false,
        prompt: 'Erstelle eine prüfbare Bestellvorlage mit Lieferant, Risiko und Freigabepunkt.',
        note: 'Vor Auslösung immer Supplier prüfen',
      },
      promptTemplates: [
        'Erstelle eine prüfbare Bestellvorlage mit Lieferant, Risiko und Freigabepunkt.',
        'Markiere Lieferantenrisiken und liste offene Rückfragen vor einer Bestellung auf.',
        'Fasse die Bestellung so zusammen, dass ein Virtueller MA sie sicher vorbereiten kann.',
      ],
    },
    {
      id: 'auto-messages',
      kind: 'feature',
      icon: '💬',
      title: 'Automatische Kundennachrichten',
      description: 'Antworten an Kunden können vorbereitet und später automatisch versendet werden.',
      config: {
        targetArea: 'virtual-ma',
        mode: 'manual',
        threshold: 'medium',
        autoStart: false,
        prompt: 'Entwirf eine freundliche Kundenantwort mit klarer Eskalationsregel und Freigabehinweis.',
        note: 'Tonfall vor Versand prüfen',
      },
      promptTemplates: [
        'Entwirf eine freundliche Kundenantwort mit klarer Eskalationsregel und Freigabehinweis.',
        'Formuliere diese Nachricht so, dass ein Virtueller MA sie vor dem Versand prüfen kann.',
        'Erstelle eine Antwortvorlage mit Tonfall, Prüfschritt und kurzer Freigabeanweisung.',
      ],
    },
    {
      id: 'auto-posting',
      kind: 'feature',
      icon: '🛍️',
      title: 'Autonomes eBay-Posting',
      description: 'Produktdaten werden automatisch für eBay vorbereitet und in den Veröffentlichungsfluss übergeben.',
      config: {
        targetArea: 'ai-task-center',
        mode: 'auto',
        threshold: 'high',
        autoStart: true,
        prompt: 'Prüfe das Listing auf Freigabe, Sichtbarkeit und sichere Veröffentlichung.',
        note: 'Nur für geprüfte Listings',
      },
      promptTemplates: [
        'Prüfe das Listing auf Freigabe, Sichtbarkeit und sichere Veröffentlichung.',
        'Bereite die eBay-Veröffentlichung nur vor, wenn alle relevanten Prüfpunkte erfüllt sind.',
        'Erstelle eine kompakte Freigabeanweisung für das AI Task Center.',
      ],
    },
  ];
  const EXTENDED_AUTONOMY_ROLE_DEFS = [
    {
      id: 'release-operator',
      kind: 'role',
      icon: '🧑‍💼',
      title: 'Freigabe-Operator',
      description: 'Entscheidet, welche geschützten Schritte in die aktive Freigabe wechseln.',
      config: {
        responsibleArea: 'ai-task-center',
        scope: 'release',
        canApprove: true,
        canLock: false,
        priority: 'high',
        prompt: 'Gib nur Schritte frei, die vollständig geprüft und für das Task Center vorbereitet sind.',
        note: 'Für manuelle Freigaben',
      },
      promptTemplates: [
        'Gib nur Schritte frei, die vollständig geprüft und für das Task Center vorbereitet sind.',
        'Prüfe die vorgeschlagene Aufgabe und entscheide, ob sie aktiv werden darf.',
        'Erstelle eine knappe Freigabeentscheidung mit Begründung und nächstem Schritt.',
      ],
    },
    {
      id: 'risk-analyst',
      kind: 'role',
      icon: '🛡️',
      title: 'Risiko-Analyst',
      description: 'Prüft Grenzfälle, Sicherheitsregeln und Rückfallpfade bevor etwas aktiv wird.',
      config: {
        responsibleArea: 'ki-agents',
        scope: 'review',
        canApprove: false,
        canLock: true,
        priority: 'high',
        prompt: 'Prüfe Risiken, Konflikte und unklare Freigaben, bevor ein KI-Agent aktiv wird.',
        note: 'Vor Aktivierung prüfen',
      },
      promptTemplates: [
        'Prüfe Risiken, Konflikte und unklare Freigaben, bevor ein KI-Agent aktiv wird.',
        'Markiere alle Stellen, an denen ein KI-Agent noch nicht sicher arbeiten sollte.',
        'Erstelle eine kurze Risikoübersicht für die aktuelle Agentenaufgabe.',
      ],
    },
    {
      id: 'workflow-orchestrator',
      kind: 'role',
      icon: '🧭',
      title: 'Workflow-Orchestrator',
      description: 'Koordiniert freigegebene Autonomie-Schritte und hält die Reihenfolge sauber.',
      config: {
        responsibleArea: 'all',
        scope: 'manage',
        canApprove: true,
        canLock: true,
        priority: 'medium',
        prompt: 'Koordiniere die Reihenfolge der freigegebenen Schritte und halte die Übergaben sauber.',
        note: 'Abläufe koordinieren',
      },
      promptTemplates: [
        'Koordiniere die Reihenfolge der freigegebenen Schritte und halte die Übergaben sauber.',
        'Erstelle einen kompakten Ablaufplan für mehrere verbundene Autonomie-Schritte.',
        'Formuliere eine Orchestrierungsanweisung mit klarer Reihenfolge und Kontrollpunkten.',
      ],
    },
    {
      id: 'support-supervisor',
      kind: 'role',
      icon: '🤝',
      title: 'Support-Supervisor',
      description: 'Steuert wieder freigeschaltete Kommunikations- und Eskalationsrollen.',
      config: {
        responsibleArea: 'virtual-ma',
        scope: 'review',
        canApprove: false,
        canLock: true,
        priority: 'medium',
        prompt: 'Bereite eine sichere Support-Antwort vor und markiere, was noch geprüft werden muss.',
        note: 'Support-Freigaben bündeln',
      },
      promptTemplates: [
        'Bereite eine sichere Support-Antwort vor und markiere, was noch geprüft werden muss.',
        'Erstelle eine Support-Vorlage mit klarer Freigabe- und Sperrlogik.',
        'Fasse die Support-Aufgabe so zusammen, dass ein Virtueller MA sie direkt nutzen kann.',
      ],
    },
  ];
  const EXTENDED_AUTONOMY_SETTING_DEFS = {
    feature: {
      'auto-actions': {
        subtitle: 'Steuert, wie aggressiv diese Automatisierung arbeiten darf.',
        fields: [
          { key: 'targetArea', kind: 'select', label: 'Verknüpft mit', options: [
            { value: 'ai-task-center', label: 'AI Task Center' },
            { value: 'ki-agents', label: 'KI-Agenten' },
            { value: 'virtual-ma', label: 'Virtuelle MA' },
            { value: 'all', label: 'Alle Bereiche' },
          ] },
          { key: 'mode', kind: 'select', label: 'Ausführungsmodus', options: [
            { value: 'manual', label: 'Mit Bestätigung' },
            { value: 'assist', label: 'Unterstützend' },
            { value: 'auto', label: 'Automatisch' },
          ] },
          { key: 'approvalRule', kind: 'select', label: 'Freigabe-Policy', options: [
            { value: 'manual_review', label: 'Manuell prüfen' },
            { value: 'guided', label: 'Geführt freigeben' },
            { value: 'automatic', label: 'Automatisch' },
          ]},
          { key: 'threshold', kind: 'select', label: 'Auslöser-Schwelle', options: [
            { value: 'low', label: 'Niedrig' },
            { value: 'medium', label: 'Mittel' },
            { value: 'high', label: 'Hoch' },
          ] },
          { key: 'autoStart', kind: 'checkbox', label: 'Autostart erlauben' },
          { key: 'requireSafetyCheck', kind: 'checkbox', label: 'Sicherheitscheck erzwingen' },
          { key: 'prompt', kind: 'textarea', label: 'Prompt', placeholder: 'Beschreibe, was diese Funktion prüfen oder vorbereiten soll.' },
          { key: 'note', kind: 'textarea', label: 'Notiz' },
        ],
      },
      'auto-orders': {
        subtitle: 'Bestellfluss und Risikogrenzen für Supplier-Aktionen.',
        fields: [
          { key: 'targetArea', kind: 'select', label: 'Verknüpft mit', options: [
            { value: 'ai-task-center', label: 'AI Task Center' },
            { value: 'ki-agents', label: 'KI-Agenten' },
            { value: 'virtual-ma', label: 'Virtuelle MA' },
            { value: 'all', label: 'Alle Bereiche' },
          ] },
          { key: 'mode', kind: 'select', label: 'Ausführungsmodus', options: [
            { value: 'manual', label: 'Mit Bestätigung' },
            { value: 'assist', label: 'Unterstützend' },
            { value: 'auto', label: 'Automatisch' },
          ] },
          { key: 'supplierGuard', kind: 'select', label: 'Supplier-Prüfung', options: [
            { value: 'strict', label: 'Streng' },
            { value: 'normal', label: 'Normal' },
            { value: 'relaxed', label: 'Locker' },
          ]},
          { key: 'maxOrderValue', kind: 'select', label: 'Max. Bestellwert', options: [
            { value: '50', label: '50 €' },
            { value: '100', label: '100 €' },
            { value: '250', label: '250 €' },
          ]},
          { key: 'requireStockCheck', kind: 'checkbox', label: 'Lagercheck erzwingen' },
          { key: 'autoStart', kind: 'checkbox', label: 'Bestellung automatisch vorbereiten' },
          { key: 'prompt', kind: 'textarea', label: 'Prompt', placeholder: 'Beschreibe, welche Bestellprüfung oder Vorbereitung gebraucht wird.' },
          { key: 'note', kind: 'textarea', label: 'Notiz' },
        ],
      },
      'auto-messages': {
        subtitle: 'Ton und Eskalation für automatische Kundenkommunikation.',
        fields: [
          { key: 'targetArea', kind: 'select', label: 'Verknüpft mit', options: [
            { value: 'ai-task-center', label: 'AI Task Center' },
            { value: 'ki-agents', label: 'KI-Agenten' },
            { value: 'virtual-ma', label: 'Virtuelle MA' },
            { value: 'all', label: 'Alle Bereiche' },
          ] },
          { key: 'mode', kind: 'select', label: 'Ausführungsmodus', options: [
            { value: 'manual', label: 'Mit Bestätigung' },
            { value: 'assist', label: 'Unterstützend' },
            { value: 'auto', label: 'Automatisch' },
          ] },
          { key: 'tone', kind: 'select', label: 'Tonfall', options: [
            { value: 'friendly', label: 'Freundlich' },
            { value: 'neutral', label: 'Neutral' },
            { value: 'direct', label: 'Direkt' },
          ]},
          { key: 'escalation', kind: 'select', label: 'Eskalationsstufe', options: [
            { value: 'low', label: 'Niedrig' },
            { value: 'medium', label: 'Mittel' },
            { value: 'high', label: 'Hoch' },
          ]},
          { key: 'allowAutoReply', kind: 'checkbox', label: 'Auto-Antwort erlauben' },
          { key: 'requireReview', kind: 'checkbox', label: 'Vor Versand prüfen' },
          { key: 'prompt', kind: 'textarea', label: 'Prompt', placeholder: 'Beschreibe, wie die Antwort klingen und geprüft werden soll.' },
          { key: 'note', kind: 'textarea', label: 'Notiz' },
        ],
      },
      'auto-posting': {
        subtitle: 'Kontrolliert, wann Listings automatisch veröffentlicht werden dürfen.',
        fields: [
          { key: 'targetArea', kind: 'select', label: 'Verknüpft mit', options: [
            { value: 'ai-task-center', label: 'AI Task Center' },
            { value: 'ki-agents', label: 'KI-Agenten' },
            { value: 'virtual-ma', label: 'Virtuelle MA' },
            { value: 'all', label: 'Alle Bereiche' },
          ] },
          { key: 'mode', kind: 'select', label: 'Ausführungsmodus', options: [
            { value: 'manual', label: 'Mit Bestätigung' },
            { value: 'assist', label: 'Unterstützend' },
            { value: 'auto', label: 'Automatisch' },
          ] },
          { key: 'publishGate', kind: 'select', label: 'Veröffentlichungs-Gate', options: [
            { value: 'manual', label: 'Nur manuell' },
            { value: 'score_80', label: 'Ab Score 80' },
            { value: 'score_90', label: 'Ab Score 90' },
          ]},
          { key: 'imageCheck', kind: 'checkbox', label: 'Bildcheck erzwingen' },
          { key: 'autoStart', kind: 'checkbox', label: 'Direkt veröffentlichen' },
          { key: 'prompt', kind: 'textarea', label: 'Prompt', placeholder: 'Beschreibe, wann das Listing veröffentlicht werden darf.' },
          { key: 'note', kind: 'textarea', label: 'Notiz' },
        ],
      },
    },
    role: {
      'release-operator': {
        subtitle: 'Steuert die Freigabe von geschützten Schritten.',
        fields: [
          { key: 'responsibleArea', kind: 'select', label: 'Zuständig für', options: [
            { value: 'ai-task-center', label: 'AI Task Center' },
            { value: 'ki-agents', label: 'KI-Agenten' },
            { value: 'virtual-ma', label: 'Virtuelle MA' },
            { value: 'all', label: 'Alle Bereiche' },
          ] },
          { key: 'scope', kind: 'select', label: 'Verantwortungsbereich', options: [
            { value: 'review', label: 'Nur prüfen' },
            { value: 'manage', label: 'Verwalten' },
            { value: 'release', label: 'Freigeben' },
          ] },
          { key: 'canApprove', kind: 'checkbox', label: 'Darf freigeben' },
          { key: 'canLock', kind: 'checkbox', label: 'Darf sperren' },
          { key: 'priority', kind: 'select', label: 'Priorität', options: [
            { value: 'low', label: 'Niedrig' },
            { value: 'medium', label: 'Mittel' },
            { value: 'high', label: 'Hoch' },
          ] },
          { key: 'prompt', kind: 'textarea', label: 'Prompt', placeholder: 'Beschreibe, nach welchen Regeln freigegeben werden soll.' },
          { key: 'note', kind: 'textarea', label: 'Notiz' },
        ],
      },
      'risk-analyst': {
        subtitle: 'Fokussiert auf Prüfen und Blockieren von Risiken.',
        fields: [
          { key: 'responsibleArea', kind: 'select', label: 'Zuständig für', options: [
            { value: 'ai-task-center', label: 'AI Task Center' },
            { value: 'ki-agents', label: 'KI-Agenten' },
            { value: 'virtual-ma', label: 'Virtuelle MA' },
            { value: 'all', label: 'Alle Bereiche' },
          ] },
          { key: 'scope', kind: 'select', label: 'Verantwortungsbereich', options: [
            { value: 'review', label: 'Nur prüfen' },
            { value: 'manage', label: 'Verwalten' },
            { value: 'release', label: 'Freigeben' },
          ] },
          { key: 'riskFocus', kind: 'select', label: 'Risikofokus', options: [
            { value: 'compliance', label: 'Compliance' },
            { value: 'margin', label: 'Marge' },
            { value: 'delivery', label: 'Lieferung' },
          ]},
          { key: 'canApprove', kind: 'checkbox', label: 'Darf freigeben' },
          { key: 'canLock', kind: 'checkbox', label: 'Darf sperren' },
          { key: 'priority', kind: 'select', label: 'Priorität', options: [
            { value: 'low', label: 'Niedrig' },
            { value: 'medium', label: 'Mittel' },
            { value: 'high', label: 'Hoch' },
          ] },
          { key: 'prompt', kind: 'textarea', label: 'Prompt', placeholder: 'Beschreibe, welche Risiken oder Konflikte geprüft werden sollen.' },
          { key: 'note', kind: 'textarea', label: 'Notiz' },
        ],
      },
      'workflow-orchestrator': {
        subtitle: 'Koordiniert Abläufe und die Reihenfolge der Freigaben.',
        fields: [
          { key: 'responsibleArea', kind: 'select', label: 'Zuständig für', options: [
            { value: 'ai-task-center', label: 'AI Task Center' },
            { value: 'ki-agents', label: 'KI-Agenten' },
            { value: 'virtual-ma', label: 'Virtuelle MA' },
            { value: 'all', label: 'Alle Bereiche' },
          ] },
          { key: 'scope', kind: 'select', label: 'Verantwortungsbereich', options: [
            { value: 'review', label: 'Nur prüfen' },
            { value: 'manage', label: 'Verwalten' },
            { value: 'release', label: 'Freigeben' },
          ] },
          { key: 'workflowScope', kind: 'select', label: 'Ablaufbereich', options: [
            { value: 'orders', label: 'Bestellungen' },
            { value: 'messages', label: 'Nachrichten' },
            { value: 'posting', label: 'Listings' },
            { value: 'all', label: 'Alle Bereiche' },
          ]},
          { key: 'canApprove', kind: 'checkbox', label: 'Darf freigeben' },
          { key: 'canLock', kind: 'checkbox', label: 'Darf sperren' },
          { key: 'priority', kind: 'select', label: 'Priorität', options: [
            { value: 'low', label: 'Niedrig' },
            { value: 'medium', label: 'Mittel' },
            { value: 'high', label: 'Hoch' },
          ] },
          { key: 'prompt', kind: 'textarea', label: 'Prompt', placeholder: 'Beschreibe die gewünschte Reihenfolge und Übergabe.' },
          { key: 'note', kind: 'textarea', label: 'Notiz' },
        ],
      },
      'support-supervisor': {
        subtitle: 'Legt fest, wie viel Support-Autonomie diese Rolle hat.',
        fields: [
          { key: 'responsibleArea', kind: 'select', label: 'Zuständig für', options: [
            { value: 'ai-task-center', label: 'AI Task Center' },
            { value: 'ki-agents', label: 'KI-Agenten' },
            { value: 'virtual-ma', label: 'Virtuelle MA' },
            { value: 'all', label: 'Alle Bereiche' },
          ] },
          { key: 'scope', kind: 'select', label: 'Verantwortungsbereich', options: [
            { value: 'review', label: 'Nur prüfen' },
            { value: 'manage', label: 'Verwalten' },
            { value: 'release', label: 'Freigeben' },
          ] },
          { key: 'supportScope', kind: 'select', label: 'Support-Bereich', options: [
            { value: 'messages', label: 'Nachrichten' },
            { value: 'returns', label: 'Retouren' },
            { value: 'both', label: 'Beides' },
          ]},
          { key: 'canApprove', kind: 'checkbox', label: 'Darf freigeben' },
          { key: 'canLock', kind: 'checkbox', label: 'Darf sperren' },
          { key: 'priority', kind: 'select', label: 'Priorität', options: [
            { value: 'low', label: 'Niedrig' },
            { value: 'medium', label: 'Mittel' },
            { value: 'high', label: 'Hoch' },
          ] },
          { key: 'prompt', kind: 'textarea', label: 'Prompt', placeholder: 'Beschreibe die gewünschte Support-Antwort oder Prüfung.' },
          { key: 'note', kind: 'textarea', label: 'Notiz' },
        ],
      },
    },
  };
  const FEATURE_MODE_OPTIONS = [
    { value: 'manual', label: 'Mit Bestätigung' },
    { value: 'assist', label: 'Unterstützend' },
    { value: 'auto', label: 'Automatisch' },
  ];
  const FEATURE_THRESHOLD_OPTIONS = [
    { value: 'low', label: 'Niedrig' },
    { value: 'medium', label: 'Mittel' },
    { value: 'high', label: 'Hoch' },
  ];
  const ROLE_SCOPE_OPTIONS = [
    { value: 'review', label: 'Nur prüfen' },
    { value: 'manage', label: 'Verwalten' },
    { value: 'release', label: 'Freigeben' },
  ];
  const ROLE_PRIORITY_OPTIONS = [
    { value: 'low', label: 'Niedrig' },
    { value: 'medium', label: 'Mittel' },
    { value: 'high', label: 'Hoch' },
  ];
  const AUTONOMY_AREA_OPTIONS = [
    { value: 'ai-task-center', label: 'AI Task Center' },
    { value: 'ki-agents', label: 'KI-Agenten' },
    { value: 'virtual-ma', label: 'Virtuelle MA' },
    { value: 'all', label: 'Alle Bereiche' },
  ];
  const MODE_OPTIONS = [
    { value: 'off', label: 'aus' },
    { value: 'suggestions', label: 'nur Vorschläge' },
    { value: 'semi', label: 'halbautomatisch' },
    { value: 'auto', label: 'automatisch' },
  ];
  const MODEL_OPTIONS = [
    { value: 'deepseek-v4-flash', label: 'deepseek-v4-flash' },
    { value: 'deepseek-v4-pro', label: 'deepseek-v4-pro' },
    { value: 'qwen-plus', label: 'qwen-plus' },
    { value: 'qwen-flash', label: 'qwen-flash' },
    { value: 'qwen-max', label: 'qwen-max' },
    { value: 'openai-mini', label: 'openai-mini' },
    { value: 'openai-standard', label: 'openai-standard' },
  ];
  const STATUS_OPTIONS = [
    { value: 'Idle', label: 'Idle' },
    { value: 'Aktiv', label: 'Aktiv' },
    { value: 'Analysiert', label: 'Analysiert' },
    { value: 'Warnung', label: 'Warnung' },
    { value: 'Pausiert', label: 'Pausiert' },
    { value: 'Fehler', label: 'Fehler' },
    { value: 'Gesperrt', label: 'Gesperrt' },
  ];
  const DEFAULT_ACTIVITY = 'Noch keine Aktivität';
  const DEFAULT_TEST_RESPONSE = 'Bereit für lokalen Testlauf';
  const AI_TASK_STATUS_OPTIONS = [
    { value: 'all', label: 'Alle' },
    { value: 'queued', label: 'In Warteschlange' },
    { value: 'running', label: 'In Bearbeitung' },
    { value: 'done', label: 'Erledigt' },
    { value: 'blocked', label: 'Blockiert' },
    { value: 'failed', label: 'Fehlgeschlagen' },
    { value: 'waiting_approval', label: 'Wartet auf Freigabe' },
  ];
  const AI_TASK_PRIORITY_OPTIONS = [
    { value: 'all', label: 'Alle Prioritäten' },
    { value: 'low', label: 'Niedrig' },
    { value: 'normal', label: 'Normal' },
    { value: 'high', label: 'Hoch' },
    { value: 'critical', label: 'Kritisch' },
  ];
  const AI_TASK_PRIORITY_ORDER = { low: 1, normal: 2, high: 3, critical: 4, medium: 2 };
  const AI_TASK_STATUS_LABELS = {
    queued: 'In Warteschlange',
    running: 'In Bearbeitung',
    done: 'Erledigt',
    failed: 'Fehlgeschlagen',
    blocked: 'Blockiert',
    waiting_approval: 'Wartet auf Freigabe',
  };
  const AI_TASK_PRIORITY_LABELS = {
    low: 'Niedrig',
    normal: 'Normal',
    medium: 'Mittel',
    high: 'Hoch',
    critical: 'Kritisch',
  };
  const AI_TASK_NOTICE_DEFAULT = 'Aktion vorbereitet: Diese Funktion wird später mit dem passenden Agenten verbunden.';
  const AI_TASK_NOTICE_SANDBOX = 'Sandbox aktiv – Aufgaben werden nur vorbereitet.';
  const AI_TASK_NOTICE_PAUSED = 'Alle Agenten sind pausiert. Es werden keine neuen Aufgaben erzeugt.';
  const AI_TASK_SOURCE_LABELS = {
    manual: 'Manuell',
    agent: 'Agent',
    demo: 'Demo',
  };
  const ORDER_WORKFLOW_DEFAULTS = {
    enabled: false,
    mode: 'semi',
    autoInvoice: true,
    autoShippingTask: true,
    autoSyncGoogleSheets: false,
    autoQueueReview: true,
    note: 'Du steuerst den Bestell-Workflow fuer Elyon. Arbeite praezise, kurz und umsetzungsorientiert.\n\nZiel:\nJede offene Bestellung sauber vorbereiten (Rechnung, Versand, Pruefung, Sync), ohne doppelte oder riskante Schritte.\n\nRegeln:\n- Antworte auf Deutsch.\n- Nutze nur verifizierte Daten aus dem aktuellen Vorgang.\n- Wenn Infos fehlen: klare Rueckfrage statt Annahmen.\n- Markiere Risiken sofort (Zahlung, Bestand, Adresse, Fristen, Abweichungen).\n- Keine Ausfuehrung ausserhalb der definierten Freigabe-Policy.\n\nAblauf:\n1. Status pruefen\n2. Naechste 3 Schritte festlegen\n3. Blocker/Risiken nennen\n4. Freigabe-Bedarf kennzeichnen\n5. Kurzprotokoll erstellen\n\nAusgabeformat:\nStatus: [Offen/In Arbeit/Erledigt]\nPrioritaet: [Niedrig/Mittel/Hoch]\nNaechster Schritt: [1 konkreter Satz]\nTo-dos:\n- [Todo 1]\n- [Todo 2]\n- [Todo 3]\nRisiko: [Kein Risiko oder kurze Beschreibung]\nFreigabe noetig: [Ja/Nein + wer]\nKurzprotokoll: [max. 5 Saetze]',
    noteLocked: true,
    lastRunAt: '',
    preparedPlans: [],
  };
  const GROUP_PROMPT_DEFAULTS = {
    'ki-agents': 'Du arbeitest analytisch und strategisch für eCommerce-Entscheidungen. Nutze vorhandene Daten priorisiert nach Umsatzhebel, Marge, Risiko und Umsetzbarkeit. Antworte strukturiert mit: 1) Kurzfazit, 2) wichtigste Chancen, 3) wichtigste Risiken, 4) konkrete nächste Schritte (max. 5), 5) offene Annahmen. Keine Live-Ausführung, keine finalen Freigaben ohne explizite Bestätigung.',
    'virtual-ma': 'Du arbeitest operativ, zuverlässig und kundenorientiert im Tagesgeschäft. Formuliere klar, knapp und umsetzbar. Prüfe vor jedem Vorschlag: Kosten, Risiken, Datenvollständigkeit und Abhängigkeiten. Gib Ergebnisse als Arbeitsanweisung mit Priorität, Verantwortlichkeit und nächstem Schritt aus. Bei Unsicherheit oder Konflikten eskalierst du statt automatisch zu handeln. Keine verbindlichen Zusagen ohne Freigabe.',
  };
  const GROUP_PROMPT_LEGACY_DEFAULTS = {
    'ki-agents': 'Nutze diesen Bereichs-Prompt als gemeinsame Leitlinie für alle KI-Agenten in diesem Tab.',
    'virtual-ma': 'Nutze diesen Bereichs-Prompt als gemeinsame Leitlinie für alle virtuellen MA in diesem Tab.',
  };
  const AI_TASK_DEMO_BASE_TIME = Date.now();
  const createTaskId = () => `ai-task-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
  const APPROVAL_QUEUE_TYPE_LABELS = {
    support_reply: 'Supportantwort',
    listing_update: 'Listing-Update',
    order_prepare: 'Bestellung vorbereiten',
    seo_update: 'SEO-Optimierung',
    risk_action: 'Risikobehandlung',
  };
  const APPROVAL_QUEUE_STATUS_LABELS = {
    pending: 'Offen',
    approved: 'Genehmigt',
    rejected: 'Abgelehnt',
    executed: 'Ausgeführt',
  };
  const APPROVAL_QUEUE_RISK_LABELS = {
    low: 'Niedrig',
    medium: 'Mittel',
    high: 'Hoch',
    critical: 'Kritisch',
  };
  const APPROVAL_QUEUE_DEMO_BASE_TIME = Date.now();
  const createApprovalQueueId = () => `approval-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
  const LIVE_ACTION_BLUEPRINTS = {
    support_reply: {
      label: 'Support-Antwort',
      stages: ['Analyse', 'Antwortentwurf', 'Manuelle Freigabe', 'Versand später'],
      connector: 'support-mail',
    },
    seo_update: {
      label: 'SEO-Optimierung',
      stages: ['Analyse', 'Listing-Entwurf', 'Manuelle Freigabe', 'Publikation später'],
      connector: 'listing-seo',
    },
    order_prepare: {
      label: 'Bestellvorbereitung',
      stages: ['Analyse', 'Bestellentwurf', 'Manuelle Freigabe', 'Bestellung später'],
      connector: 'supplier-order',
    },
    listing_update: {
      label: 'Listing-Update',
      stages: ['Analyse', 'Listing-Entwurf', 'Manuelle Freigabe', 'Veröffentlichung später'],
      connector: 'listing-publish',
    },
    risk_action: {
      label: 'Risikobehandlung',
      stages: ['Analyse', 'Risikoentwurf', 'Manuelle Freigabe', 'Weitere Prüfung später'],
      connector: 'risk-review',
    },
  };
  const getLiveActionBlueprint = (type) => LIVE_ACTION_BLUEPRINTS[normalizeApprovalQueueType(type)] || LIVE_ACTION_BLUEPRINTS.listing_update;
  const FUTURE_PIPELINE_DEFAULTS = {
    lockedFunctions: {
      'full-automation': 'risk_action',
      'auto-orders': 'order_prepare',
      'auto-messages': 'support_reply',
      'auto-ebay-posting': 'listing_update',
    },
    lockedRoles: {
      'soul-listing': 'listing_update',
      'soul-pricing': 'risk_action',
      'soul-supplier': 'order_prepare',
      'soul-compliance': 'risk_action',
      'soul-returns': 'support_reply',
      'soul-dispatch': 'order_prepare',
      'soul-inventory': 'order_prepare',
      'soul-review': 'risk_action',
    },
  };
  const getDefaultFuturePipelineType = (kind, id) => {
    const bucket = FUTURE_PIPELINE_DEFAULTS[kind] || {};
    return bucket[id] || 'risk_action';
  };
  const getDefaultFuturePipelineBlueprint = (kind, id) => getLiveActionBlueprint(getDefaultFuturePipelineType(kind, id));
  const FUTURE_PIPELINE_OPTIONS = [
    { value: 'risk_action', label: 'Risikobehandlung' },
    { value: 'support_reply', label: 'Support-Antwort' },
    { value: 'seo_update', label: 'SEO-Optimierung' },
    { value: 'order_prepare', label: 'Bestellvorbereitung' },
    { value: 'listing_update', label: 'Listing-Update' },
  ];
  const guessFuturePipelineType = (kind, id, title) => {
    const text = `${kind || ''} ${id || ''} ${title || ''}`.toLowerCase();
    if (text.includes('support')) return 'support_reply';
    if (text.includes('seo')) return 'seo_update';
    if (text.includes('order') || text.includes('supplier') || text.includes('dispatch')) return 'order_prepare';
    if (text.includes('listing') || text.includes('ebay') || text.includes('post')) return 'listing_update';
    return 'risk_action';
  };
  const getFuturePipelineBlueprint = (kind, id, title) => getLiveActionBlueprint(guessFuturePipelineType(kind, id, title));
  const buildLiveActionPipeline = (type, context) => {
    const blueprint = getLiveActionBlueprint(type);
    return {
      stage: 'planned',
      liveEnabled: false,
      requiresConfirmation: true,
      actionType: normalizeApprovalQueueType(type),
      label: blueprint.label,
      connector: blueprint.connector,
      stages: blueprint.stages.slice(),
      context: context && typeof context === 'object' ? { ...context } : {},
    };
  };
  const decorateApprovalPayload = (type, payload, context) => {
    const basePayload = payload && typeof payload === 'object' && !Array.isArray(payload) ? { ...payload } : {};
    basePayload.livePipeline = buildLiveActionPipeline(type, context);
    return basePayload;
  };
  const resolveApprovalLivePipeline = (approvalEntry) => {
    const livePipeline = approvalEntry && approvalEntry.payload && approvalEntry.payload.livePipeline;
    if (livePipeline && typeof livePipeline === 'object') {
      return livePipeline;
    }
    return buildLiveActionPipeline(
      approvalEntry && approvalEntry.type ? approvalEntry.type : 'listing_update',
      approvalEntry && approvalEntry.payload && typeof approvalEntry.payload === 'object' ? approvalEntry.payload : {}
    );
  };
  const formatLivePipelineText = (pipeline) => {
    if (!pipeline || typeof pipeline !== 'object') return 'Keine Live-Pipeline hinterlegt.';
    const stages = Array.isArray(pipeline.stages) ? pipeline.stages.join(' → ') : '';
    const connector = pipeline.connector ? `Connector: ${pipeline.connector}` : '';
    const liveState = pipeline.liveEnabled ? 'Live später aktivierbar' : 'Nur vorbereitet, keine Live-Ausführung';
    return [pipeline.label || 'Live-Pipeline', liveState, stages, connector].filter(Boolean).join(' | ');
  };
  const LIVE_CONNECTORS = {
    'support-mail': {
      id: 'support-mail',
      label: 'Support-Mail',
      prepare: (approvalEntry, pipeline) => {
        const preview = String(approvalEntry && approvalEntry.previewText ? approvalEntry.previewText : '').trim();
        const title = String(approvalEntry && approvalEntry.title ? approvalEntry.title : 'Supportanfrage').trim();
        const recipient = String(approvalEntry && approvalEntry.payload && approvalEntry.payload.recipient ? approvalEntry.payload.recipient : '').trim() || 'support@lokal.placeholder';
        const subject = String(approvalEntry && approvalEntry.payload && approvalEntry.payload.subject ? approvalEntry.payload.subject : title).trim();
        const body = preview || 'Hallo, danke für deine Nachricht. Ich prüfe den Fall und melde mich zeitnah.';
        return {
          ok: true,
          status: 'prepared',
          connectorId: 'support-mail',
          connectorLabel: 'Support-Mail',
          message: 'Support-Antwort vorbereitet. Versand bleibt manuell.',
          draft: {
            recipient,
            subject,
            body,
            pipeline: pipeline || null,
          },
        };
      },
    },
    'listing-seo': {
      id: 'listing-seo',
      label: 'Listing-SEO',
      prepare: (approvalEntry, pipeline) => {
        const preview = String(approvalEntry && approvalEntry.previewText ? approvalEntry.previewText : '').trim();
        const payload = approvalEntry && approvalEntry.payload && typeof approvalEntry.payload === 'object' ? approvalEntry.payload : {};
        const sourceTitle = String(payload.sourceTaskTitle || approvalEntry && approvalEntry.title || 'Listing').trim();
        const titleCandidates = [
          payload.suggestedTitle,
          payload.optimizedTitle,
          payload.titleIdea,
          preview,
          `${sourceTitle} - Premium, kompakt, praktisch`,
        ].map((item) => String(item || '').trim()).filter(Boolean);
        const keywordCandidates = [
          payload.mainKeyword,
          payload.seoKeywords,
          payload.keywords,
          payload.titleIdeas,
        ].flatMap((item) => String(item || '').split(',').map((part) => part.trim()).filter(Boolean));
        const uniqueKeywords = Array.from(new Set(keywordCandidates.filter(Boolean)));
        const description = String(
          payload.optimizedDescription
          || payload.description
          || preview
          || 'SEO-Optimierung vorbereitet. Die Änderungen werden erst nach manueller Freigabe angewendet.'
        ).trim();
        return {
          ok: true,
          status: 'prepared',
          connectorId: 'listing-seo',
          connectorLabel: 'Listing-SEO',
          message: 'SEO-Entwurf vorbereitet. Veröffentlichung bleibt manuell.',
          draft: {
            title: titleCandidates[0] || sourceTitle,
            altTitles: titleCandidates.slice(1, 4),
            keywords: uniqueKeywords.slice(0, 12),
            description,
            pipeline: pipeline || null,
          },
        };
      },
    },
    'supplier-order': {
      id: 'supplier-order',
      label: 'Supplier-Order',
      prepare: (approvalEntry, pipeline) => {
        const payload = approvalEntry && approvalEntry.payload && typeof approvalEntry.payload === 'object' ? approvalEntry.payload : {};
        const sourceTitle = String(payload.sourceTaskTitle || approvalEntry && approvalEntry.title || 'Bestellung').trim();
        const supplierName = String(payload.supplierName || payload.vendor || 'Supplier').trim();
        const orderReference = String(payload.orderReference || approvalEntry && approvalEntry.id || `SO-${Date.now()}`).trim();
        const items = Array.isArray(payload.items) ? payload.items.map((item) => String(item || '').trim()).filter(Boolean) : [];
        const notes = String(payload.notes || payload.orderNotes || 'Bestellung lokal vorbereitet. Versand bleibt manuell.').trim();
        return {
          ok: true,
          status: 'prepared',
          connectorId: 'supplier-order',
          connectorLabel: 'Supplier-Order',
          message: 'Bestellvorbereitung erstellt. Keine Bestellung wurde ausgeführt.',
          draft: {
            supplier: supplierName,
            reference: orderReference,
            title: sourceTitle,
            items,
            notes,
            pipeline: pipeline || null,
          },
        };
      },
    },
    'listing-publish': {
      id: 'listing-publish',
      label: 'Listing-Publish',
      prepare: (approvalEntry, pipeline) => {
        const payload = approvalEntry && approvalEntry.payload && typeof approvalEntry.payload === 'object' ? approvalEntry.payload : {};
        const title = String(payload.sourceTaskTitle || approvalEntry && approvalEntry.title || 'Listing').trim();
        const targetStatus = String(payload.targetStatus || 'eBay Ready').trim();
        const checklist = Array.isArray(payload.checklist) ? payload.checklist.map((item) => String(item || '').trim()).filter(Boolean) : [];
        return {
          ok: true,
          status: 'prepared',
          connectorId: 'listing-publish',
          connectorLabel: 'Listing-Publish',
          message: 'Listing-Update vorbereitet. Veröffentlichung bleibt manuell.',
          draft: {
            title,
            targetStatus,
            checklist,
            pipeline: pipeline || null,
          },
        };
      },
    },
    'risk-review': {
      id: 'risk-review',
      label: 'Risk-Review',
      prepare: (approvalEntry, pipeline) => {
        const payload = approvalEntry && approvalEntry.payload && typeof approvalEntry.payload === 'object' ? approvalEntry.payload : {};
        const summary = String(payload.summary || approvalEntry && approvalEntry.description || 'Risikoprüfung vorbereitet.').trim();
        const riskNotes = Array.isArray(payload.riskNotes) ? payload.riskNotes.map((item) => String(item || '').trim()).filter(Boolean) : [];
        return {
          ok: true,
          status: 'prepared',
          connectorId: 'risk-review',
          connectorLabel: 'Risk-Review',
          message: 'Risikoprüfung vorbereitet. Keine Live-Aktion wurde ausgeführt.',
          draft: {
            summary,
            riskNotes,
            pipeline: pipeline || null,
          },
        };
      },
    },
  };
  const getLiveConnector = (connectorId) => LIVE_CONNECTORS[connectorId] || null;
  const LIVE_ACTION_HANDLERS = {
    support_reply: async (approvalEntry, pipeline) => {
      const connector = getLiveConnector(pipeline && pipeline.connector ? pipeline.connector : 'support-mail');
      if (connector && typeof connector.prepare === 'function') {
        return connector.prepare(approvalEntry, pipeline);
      }
      return { ok: false, status: 'prepared', message: 'Support-Nachrichten sind nur vorbereitet.', entryId: approvalEntry && approvalEntry.id ? approvalEntry.id : '' };
    },
    seo_update: async (approvalEntry, pipeline) => {
      const connector = getLiveConnector(pipeline && pipeline.connector ? pipeline.connector : 'listing-seo');
      if (connector && typeof connector.prepare === 'function') {
        return connector.prepare(approvalEntry, pipeline);
      }
      return { ok: false, status: 'prepared', message: 'SEO-Updates sind nur vorbereitet.', entryId: approvalEntry && approvalEntry.id ? approvalEntry.id : '' };
    },
    order_prepare: async (approvalEntry, pipeline) => {
      const connector = getLiveConnector(pipeline && pipeline.connector ? pipeline.connector : 'supplier-order');
      if (connector && typeof connector.prepare === 'function') {
        return connector.prepare(approvalEntry, pipeline);
      }
      return { ok: false, status: 'prepared', message: 'Bestellschritte sind nur vorbereitet.', entryId: approvalEntry && approvalEntry.id ? approvalEntry.id : '' };
    },
    listing_update: async (approvalEntry, pipeline) => {
      const connector = getLiveConnector(pipeline && pipeline.connector ? pipeline.connector : 'listing-publish');
      if (connector && typeof connector.prepare === 'function') {
        return connector.prepare(approvalEntry, pipeline);
      }
      return { ok: false, status: 'prepared', message: 'Listing-Änderungen sind nur vorbereitet.', entryId: approvalEntry && approvalEntry.id ? approvalEntry.id : '' };
    },
    risk_action: async (approvalEntry, pipeline) => {
      const connector = getLiveConnector(pipeline && pipeline.connector ? pipeline.connector : 'risk-review');
      if (connector && typeof connector.prepare === 'function') {
        return connector.prepare(approvalEntry, pipeline);
      }
      return { ok: false, status: 'prepared', message: 'Risikoprüfungen bleiben im Vorschau-Modus.', entryId: approvalEntry && approvalEntry.id ? approvalEntry.id : '' };
    },
  };
  const getLiveActionHandler = (type) => LIVE_ACTION_HANDLERS[normalizeApprovalQueueType(type)] || LIVE_ACTION_HANDLERS.listing_update;
  const executeLiveAction = async (approvalEntry) => {
    const pipeline = resolveApprovalLivePipeline(approvalEntry);
    if (!pipeline) {
      return { ok: false, status: 'missing_pipeline', message: 'Keine Live-Pipeline vorhanden.' };
    }
    if (isSecurityLocked() || isAiActionBlocked()) {
      return { ok: false, status: 'blocked', message: 'Live-Ausführung ist derzeit gesperrt.' };
    }
    const handler = getLiveActionHandler(pipeline.actionType);
    const result = await handler(approvalEntry, pipeline);
    return result || {
      ok: false,
      status: 'prepared',
      message: 'Live-Ausführung ist noch nicht aktiviert. Die Pipeline bleibt nur vorbereitet.',
      pipeline,
    };
  };
  const getLivePipelineRoadmap = () => [
    {
      title: 'Support-Antwort',
      type: 'support_reply',
      connector: 'support-mail',
      note: 'Antworten vorbereiten, dann manuell freigeben.',
    },
    {
      title: 'SEO-Optimierung',
      type: 'seo_update',
      connector: 'listing-seo',
      note: 'Listing-Texte erst prüfen, später anwenden.',
    },
    {
      title: 'Bestellvorbereitung',
      type: 'order_prepare',
      connector: 'supplier-order',
      note: 'Supplier-Daten vorbereiten, aber nichts absenden.',
    },
    {
      title: 'Listing-Update',
      type: 'listing_update',
      connector: 'listing-publish',
      note: 'Änderung erst nach manueller Freigabe publizieren.',
    },
    {
      title: 'Risikobehandlung',
      type: 'risk_action',
      connector: 'risk-review',
      note: 'Risikofälle nur vorbereiten und prüfen.',
    },
  ];
  const buildLivePipelineRoadmapCard = () => {
    const items = getLivePipelineRoadmap();
    return `
      <article class="virtual-agent-card task-center-card">
        <div class="task-center-card-top">
          <div class="task-center-card-heading">
            <div class="task-center-triage-title">
              <h4>Live-Pipeline Blueprint</h4>
              <span class="pill">Vorbereitet, nicht aktiv</span>
            </div>
            <p>Diese Struktur zeigt, wie spätere Live-Aktionen angedockt werden können. Aktuell bleibt alles in der Freigabe-Logik.</p>
          </div>
          <div class="task-center-badge-stack">
            <span class="virtual-agent-badge info">Gerüst</span>
            <span class="virtual-agent-badge warn">Keine Ausführung</span>
          </div>
        </div>
        <div class="virtual-future-grid" style="margin-top:14px">
          ${items.map((item) => {
            const blueprint = getLiveActionBlueprint(item.type);
            return `
              <div class="virtual-future-card">
                <div class="virtual-agent-ident">
                  <div class="virtual-agent-icon">🧭</div>
                  <div>
                    <h4>${escapeHtml(item.title)}</h4>
                    <p>${escapeHtml(item.note)}</p>
                    <div style="margin-top:8px" class="virtual-agent-summary-meta">
                      <span class="pill">${escapeHtml(blueprint.label)}</span>
                      <span class="pill">${escapeHtml(item.connector)}</span>
                    </div>
                  </div>
                </div>
                <div class="hint" style="margin-top:10px">${escapeHtml(blueprint.stages.join(' → '))}</div>
              </div>
            `;
          }).join('')}
        </div>
      </article>
    `;
  };

  const buildDemoAiTasks = () => [
    {
      id: 'demo-product-margin',
      title: 'Produktmarge prüfen',
      description: 'Soul Finance würde Produkte mit niedriger Marge markieren.',
      agent: 'Soul Finance',
      category: 'Finanzen',
      priority: 'high',
      status: 'open',
      createdAt: new Date(AI_TASK_DEMO_BASE_TIME - 3 * 60000).toISOString(),
      source: 'demo',
      actionLabel: 'Prüfung ansehen',
    },
    {
      id: 'demo-seo-opportunity',
      title: 'SEO-Chance erkennen',
      description: 'Soul SEO würde Listings mit schwachem Titel oder fehlenden Keywords markieren.',
      agent: 'Soul SEO',
      category: 'SEO',
      priority: 'medium',
      status: 'open',
      createdAt: new Date(AI_TASK_DEMO_BASE_TIME - 2 * 60000).toISOString(),
      source: 'demo',
      actionLabel: 'SEO prüfen',
    },
    {
      id: 'demo-delivery-risk',
      title: 'Lieferzeit-Risiko beobachten',
      description: 'Soul Guard würde Produkte mit langer Lieferzeit oder riskantem Supplier markieren.',
      agent: 'Soul Guard',
      category: 'Risiko',
      priority: 'critical',
      status: 'open',
      createdAt: new Date(AI_TASK_DEMO_BASE_TIME - 1 * 60000).toISOString(),
      source: 'demo',
      actionLabel: 'Risiko ansehen',
    },
  ];

  const getEl = (id) => document.getElementById(id);
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
  const toast = (message, eyebrow = 'Elyon') => {
    if (typeof window.toast === 'function') {
      window.toast(message, eyebrow);
      return;
    }
    console.warn(`[${eyebrow}] ${message}`);
  };

  const normalizePanel = (panel) => {
  const valid = ['overview', 'order-workflow', 'ai-task-center', 'approval-queue', 'virtual-ma', 'ki-agents'];
    return valid.includes(panel) ? panel : 'overview';
  };

  const normalizeMode = (value) => {
    const input = String(value || '').trim();
    return MODE_OPTIONS.some((item) => item.value === input) ? input : 'suggestions';
  };

  const normalizeModel = (value) => {
    const input = String(value || '').trim();
    return MODEL_OPTIONS.some((item) => item.value === input) ? input : 'qwen-plus';
  };

  const normalizeLimit = (value) => {
    const parsed = Number.parseFloat(String(value ?? '').replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed < 0) return 0.25;
    return Math.round(parsed * 100) / 100;
  };

  const normalizeStatusState = (value) => {
    const input = String(value || '').trim();
    return STATUS_OPTIONS.some((item) => item.value === input) ? input : 'Idle';
  };

  const normalizeUsage = (value) => {
    const parsed = Number.parseFloat(String(value ?? '').replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed < 0) return 0;
    return Math.round(parsed * 100) / 100;
  };

  const sanitizeDescription = (value, fallback) => {
    const text = String(value ?? '').replace(/\s+/g, ' ').trim();
    if (!text) return fallback;
    return text.slice(0, 240);
  };

  const sanitizeActivity = (value, fallback) => {
    const text = String(value ?? '').replace(/\s+/g, ' ').trim();
    if (!text) return fallback;
    return text.slice(0, 220);
  };

  const sanitizeWorkflowNote = (value, fallback) => {
    const text = String(value ?? '').replace(/\r\n/g, '\n').trim();
    if (!text) return fallback;
    return text.slice(0, 4000);
  };

  const resolveOrderWorkflowNote = (value) => sanitizeWorkflowNote(value, ORDER_WORKFLOW_DEFAULTS.note);

  const sanitizePromptText = (value, fallback) => {
    const text = String(value ?? '').replace(/\r\n/g, '\n').trim();
    if (!text) return fallback;
    return text.slice(0, 1200);
  };

  const sanitizePromptTemplateList = (value) => {
    const list = Array.isArray(value) ? value : [];
    return list
      .map((item) => sanitizePromptText(item, ''))
      .filter(Boolean)
      .slice(0, 8);
  };

  const tryParseJson = (text) => {
    const raw = String(text ?? '').trim();
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (error) {
      const start = raw.indexOf('{');
      const end = raw.lastIndexOf('}');
      if (start >= 0 && end > start) {
        try {
          return JSON.parse(raw.slice(start, end + 1));
        } catch (innerError) {
          return null;
        }
      }
      const arrayStart = raw.indexOf('[');
      const arrayEnd = raw.lastIndexOf(']');
      if (arrayStart >= 0 && arrayEnd > arrayStart) {
        try {
          return JSON.parse(raw.slice(arrayStart, arrayEnd + 1));
        } catch (innerArrayError) {
          return null;
        }
      }
      return null;
    }
  };

  const sanitizeTaskText = (value, fallback, maxLength) => {
    const text = String(value ?? '').replace(/\s+/g, ' ').trim();
    if (!text) return fallback;
    return text.slice(0, maxLength);
  };

  const normalizeTaskPriority = (value) => {
    const input = String(value || '').trim();
    if (input === 'medium') return 'normal';
    return Object.prototype.hasOwnProperty.call(AI_TASK_PRIORITY_LABELS, input) ? input : 'normal';
  };

  const normalizeTaskStatus = (value) => {
    const input = String(value || '').trim();
    if (input === 'open') return 'queued';
    if (input === 'in_progress') return 'running';
    if (input === 'dismissed') return 'blocked';
    return Object.prototype.hasOwnProperty.call(AI_TASK_STATUS_LABELS, input) ? input : 'queued';
  };

  const normalizeTaskSource = (value) => {
    const input = String(value || '').trim();
    return Object.prototype.hasOwnProperty.call(AI_TASK_SOURCE_LABELS, input) ? input : 'manual';
  };

  const normalizeAiTask = (task, index) => {
    if (!task || typeof task !== 'object' || Array.isArray(task)) return null;
    const createdAt = Date.parse(task.createdAt || '');
    return {
      id: sanitizeTaskText(task.id || `ai-task-${index + 1}`, `ai-task-${index + 1}`, 80),
      title: sanitizeTaskText(task.title, 'Unbenannte Aufgabe', 120),
      description: sanitizeTaskText(task.description, '', 260),
      agent: sanitizeTaskText(task.agent, 'Unbekannter Agent', 80),
      category: sanitizeTaskText(task.category, 'Allgemein', 60),
      priority: normalizeTaskPriority(task.priority),
      status: normalizeTaskStatus(task.status),
      createdAt: Number.isFinite(createdAt) ? new Date(createdAt).toISOString() : new Date().toISOString(),
      source: normalizeTaskSource(task.source),
      actionLabel: sanitizeTaskText(task.actionLabel, 'Aktion vorbereiten', 40),
    };
  };

  const normalizeAiTasks = (value) => {
    const list = Array.isArray(value) ? value : [];
    const next = list
      .map((task, index) => normalizeAiTask(task, index))
      .filter(Boolean);
    return next.length ? next : buildDemoAiTasks();
  };

  const AI_TASKS_STORE_KEY = 'elyon_ai_tasks';
  const AI_EVENTS_STORE_KEY = 'elyon_ai_events';
  const AI_LOGS_STORE_KEY = 'elyon_ai_logs';
  const AI_TASK_LIVE_HINT = 'Live-Aktionen bleiben durch Sicherheitsmodus oder Sandbox blockiert.';
  const AI_TASK_SAFE_TYPES = ['product_analysis', 'listing_review', 'margin_check', 'customer_reply_draft', 'supplier_check'];
  const AI_TASK_TYPES = [
    { value: 'product_analysis', label: 'product_analysis' },
    { value: 'listing_review', label: 'listing_review' },
    { value: 'margin_check', label: 'margin_check' },
    { value: 'customer_reply_draft', label: 'customer_reply_draft' },
    { value: 'supplier_check', label: 'supplier_check' },
    { value: 'research', label: 'research' },
    { value: 'seo_audit', label: 'seo_audit' },
    { value: 'risk_audit', label: 'risk_audit' },
    { value: 'support_summary', label: 'support_summary' },
    { value: 'operations_check', label: 'operations_check' },
  ];
  const AI_TASK_PRIORITIES = ['low', 'normal', 'high', 'critical'];
  const AI_TASK_STATUSES = ['queued', 'running', 'done', 'failed', 'blocked', 'waiting_approval'];

  const normalizeAiTaskRecord = (task, index = 0) => {
    if (!task || typeof task !== 'object' || Array.isArray(task)) return null;
    const createdAt = Date.parse(task.createdAt || '');
    const updatedAt = Date.parse(task.updatedAt || task.createdAt || '');
    const startedAt = Date.parse(task.startedAt || '');
    const finishedAt = Date.parse(task.finishedAt || '');
    const safeType = AI_TASK_TYPES.some((item) => item.value === task.type) ? task.type : 'product_analysis';
    const safePriority = AI_TASK_PRIORITIES.includes(task.priority) ? task.priority : 'normal';
    const safeStatus = AI_TASK_STATUSES.includes(task.status) ? task.status : 'queued';
    return {
      id: sanitizeTaskText(task.id || `ai-task-${index + 1}`, `ai-task-${index + 1}`, 80),
      title: sanitizeTaskText(task.title, 'Unbenannte Aufgabe', 120),
      description: sanitizeTaskText(task.description, '', 500),
      agentId: sanitizeTaskText(task.agentId || '', '', 80),
      agentType: sanitizeTaskText(task.agentType || '', '', 80),
      type: safeType,
      status: safeStatus,
      priority: safePriority,
      input: task.input && typeof task.input === 'object' ? { ...task.input } : {},
      result: sanitizeTaskText(task.result, '', 1200),
      error: sanitizeTaskText(task.error, '', 1200),
      logs: Array.isArray(task.logs) ? task.logs.slice(0, 50) : [],
      createdAt: Number.isFinite(createdAt) ? new Date(createdAt).toISOString() : new Date().toISOString(),
      updatedAt: Number.isFinite(updatedAt) ? new Date(updatedAt).toISOString() : new Date().toISOString(),
      startedAt: Number.isFinite(startedAt) ? new Date(startedAt).toISOString() : '',
      finishedAt: Number.isFinite(finishedAt) ? new Date(finishedAt).toISOString() : '',
    };
  };

  const normalizeAiEventRecord = (event, index = 0) => {
    if (!event || typeof event !== 'object' || Array.isArray(event)) return null;
    const createdAt = Date.parse(event.createdAt || '');
    return {
      id: sanitizeTaskText(event.id || `ai-event-${index + 1}`, `ai-event-${index + 1}`, 80),
      type: sanitizeTaskText(event.type, 'task.created', 80),
      source: sanitizeTaskText(event.source, 'task', 80),
      payload: event.payload && typeof event.payload === 'object' ? { ...event.payload } : {},
      relatedTaskId: sanitizeTaskText(event.relatedTaskId || '', '', 80),
      createdAt: Number.isFinite(createdAt) ? new Date(createdAt).toISOString() : new Date().toISOString(),
      handled: event.handled === true,
    };
  };

  const normalizeAiLogRecord = (log, index = 0) => {
    if (!log || typeof log !== 'object' || Array.isArray(log)) return null;
    const createdAt = Date.parse(log.createdAt || '');
    return {
      id: sanitizeTaskText(log.id || `ai-log-${index + 1}`, `ai-log-${index + 1}`, 80),
      level: ['info', 'warning', 'error', 'security'].includes(log.level) ? log.level : 'info',
      message: sanitizeTaskText(log.message, '', 1200),
      context: log.context && typeof log.context === 'object' ? { ...log.context } : {},
      taskId: sanitizeTaskText(log.taskId || '', '', 80),
      agentId: sanitizeTaskText(log.agentId || '', '', 80),
      createdAt: Number.isFinite(createdAt) ? new Date(createdAt).toISOString() : new Date().toISOString(),
    };
  };

  const readStoredCollection = (key, normalizer, fallback = []) => {
    const list = Array.isArray(readJson(key, [])) ? readJson(key, []) : [];
    const next = list.map((item, index) => normalizer(item, index)).filter(Boolean);
    return next.length ? next : fallback.slice();
  };

  const writeStoredCollection = (key, value) => writeJson(key, Array.isArray(value) ? value : []);

  const getAiTasks = () => readStoredCollection(AI_TASKS_STORE_KEY, normalizeAiTaskRecord, normalizeAiTasks(state.aiTasks || []));
  const getAiEvents = () => readStoredCollection(AI_EVENTS_STORE_KEY, normalizeAiEventRecord, []);
  const getAiLogs = () => readStoredCollection(AI_LOGS_STORE_KEY, normalizeAiLogRecord, []);
  const getAiWorkflowSnapshot = () => ({
    tasks: getAiTasks(),
    events: getAiEvents(),
    logs: getAiLogs(),
  });

  const getAiWorkflowApiBase = () => {
    const backendUrl = typeof getBackendUrl === 'function' ? getBackendUrl() : '';
    if (backendUrl) return backendUrl;
    const storedBackend = localStorage.getItem('backendUrl') || '';
    return normalizeBackendUrl(storedBackend) || '';
  };

  const syncAiWorkflowToServer = async () => {
    try {
      const apiBase = getAiWorkflowApiBase();
      const endpoint = apiBase ? `${apiBase}/api/agent-engine?action=ai-workflow` : '/api/agent-engine?action=ai-workflow';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(getAiWorkflowSnapshot()),
      });
      const data = await response.json().catch(() => null);
      return response.ok ? data : null;
    } catch {
      return null;
    }
  };

  const loadAiWorkflowFromServer = async () => {
    try {
      const apiBase = getAiWorkflowApiBase();
      const endpoint = apiBase ? `${apiBase}/api/agent-engine?action=ai-workflow` : '/api/agent-engine?action=ai-workflow';
      const response = await fetch(endpoint, { method: 'GET' });
      const data = await response.json().catch(() => null);
      const serverData = data && data.data && typeof data.data === 'object' ? data.data : null;
      if (!response.ok || !serverData) return false;
      const remoteTasks = Array.isArray(serverData.tasks) ? serverData.tasks.map((item, index) => normalizeAiTaskRecord(item, index)).filter(Boolean) : [];
      const remoteEvents = Array.isArray(serverData.events) ? serverData.events.map((item, index) => normalizeAiEventRecord(item, index)).filter(Boolean) : [];
      const remoteLogs = Array.isArray(serverData.logs) ? serverData.logs.map((item, index) => normalizeAiLogRecord(item, index)).filter(Boolean) : [];
      if (remoteTasks.length) state.aiTasks = remoteTasks;
      if (remoteEvents.length) localStorage.setItem(AI_EVENTS_STORE_KEY, JSON.stringify(remoteEvents));
      if (remoteLogs.length) localStorage.setItem(AI_LOGS_STORE_KEY, JSON.stringify(remoteLogs));
      persistAiCollections();
      return true;
    } catch {
      return false;
    }
  };

  const persistAiCollections = () => {
    writeStoredCollection(AI_TASKS_STORE_KEY, state.aiTasks);
    writeStoredCollection(AI_EVENTS_STORE_KEY, getAiEvents());
    writeStoredCollection(AI_LOGS_STORE_KEY, getAiLogs());
    syncAiWorkflowToServer();
  };

  const createAiEvent = (eventData) => {
    const event = normalizeAiEventRecord({
      id: `ai-event-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`,
      type: eventData && eventData.type ? eventData.type : 'task.created',
      source: eventData && eventData.source ? eventData.source : 'system',
      payload: eventData && eventData.payload && typeof eventData.payload === 'object' ? eventData.payload : {},
      relatedTaskId: eventData && eventData.relatedTaskId ? eventData.relatedTaskId : '',
      createdAt: nowIso(),
      handled: eventData && eventData.handled === true,
    });
    const events = getAiEvents();
    events.unshift(event);
    writeStoredCollection(AI_EVENTS_STORE_KEY, events.slice(0, 200));
    return event;
  };

  const createAiLog = (logData) => {
    const log = normalizeAiLogRecord({
      id: `ai-log-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`,
      level: logData && logData.level ? logData.level : 'info',
      message: logData && logData.message ? logData.message : '',
      context: logData && logData.context && typeof logData.context === 'object' ? logData.context : {},
      taskId: logData && logData.taskId ? logData.taskId : '',
      agentId: logData && logData.agentId ? logData.agentId : '',
      createdAt: nowIso(),
    });
    const logs = getAiLogs();
    logs.unshift(log);
    writeStoredCollection(AI_LOGS_STORE_KEY, logs.slice(0, 250));
    return log;
  };

  const createAiTask = (taskData) => {
    const task = normalizeAiTaskRecord({
      id: `ai-task-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`,
      title: taskData && taskData.title ? taskData.title : 'Neue Aufgabe',
      description: taskData && taskData.description ? taskData.description : '',
      agentId: taskData && taskData.agentId ? taskData.agentId : '',
      agentType: taskData && taskData.agentType ? taskData.agentType : '',
      type: taskData && taskData.type ? taskData.type : 'product_analysis',
      status: 'queued',
      priority: taskData && taskData.priority ? taskData.priority : 'normal',
      input: taskData && taskData.input && typeof taskData.input === 'object' ? taskData.input : {},
      result: '',
      error: '',
      logs: [],
      createdAt: nowIso(),
      updatedAt: nowIso(),
      startedAt: '',
      finishedAt: '',
    });
    const tasks = getAiTasks();
    tasks.unshift(task);
    state.aiTasks = tasks;
    persistAiCollections();
    createAiEvent({ type: 'task.created', source: 'ui', payload: task, relatedTaskId: task.id });
    createAiLog({ level: 'info', message: `Task erstellt: ${task.title}`, taskId: task.id, agentId: task.agentId, context: { type: task.type, priority: task.priority } });
    saveState();
    render();
    return task;
  };

  const updateAiTask = (taskId, patch) => {
    const tasks = getAiTasks();
    const index = tasks.findIndex((task) => task && task.id === taskId);
    if (index < 0) return null;
    const current = tasks[index];
    const nextPatch = typeof patch === 'function' ? patch(current) : patch;
    if (!nextPatch || typeof nextPatch !== 'object') return current;
    tasks[index] = normalizeAiTaskRecord({ ...current, ...nextPatch, id: current.id }, index);
    state.aiTasks = tasks;
    persistAiCollections();
    saveState();
    render();
    return tasks[index];
  };

  const blockAiTask = (taskId, reason) => updateAiTask(taskId, { status: 'blocked', error: sanitizeTaskText(reason, 'Blockiert', 240), finishedAt: nowIso(), updatedAt: nowIso() });
  const completeAiTask = (taskId, result) => updateAiTask(taskId, { status: 'done', result: sanitizeTaskText(result, '', 1200), finishedAt: nowIso(), updatedAt: nowIso() });
  const failAiTask = (taskId, error) => updateAiTask(taskId, { status: 'failed', error: sanitizeTaskText(error, 'Fehler', 1200), finishedAt: nowIso(), updatedAt: nowIso() });

  const buildEffectiveAgentPrompt = (agentId, task) => {
    const agent = getAgent(agentId);
    const areaPrompt = sanitizeDescription(agent && agent.description ? agent.description : '', '');
    const individualPrompt = sanitizeDescription(agent && agent.prompt ? agent.prompt : '', '');
    const guardrails = sanitizeDescription(agent && agent.guardrails ? agent.guardrails : 'Nur Vorschläge, Entwürfe und lokale Analysen. Keine autonomen Live-Aktionen.', '');
    const taskContext = task && typeof task === 'object'
      ? [
          `Task-Titel: ${sanitizeTaskText(task.title, '', 120)}`,
          `Task-Typ: ${sanitizeTaskText(task.type, '', 80)}`,
          `Task-Prio: ${sanitizeTaskText(task.priority, '', 20)}`,
          `Task-Beschreibung: ${sanitizeTaskText(task.description, '', 500)}`,
        ].join('\n')
      : 'Task-Kontext: unbekannt';
    return [areaPrompt, individualPrompt, `Guardrails: ${guardrails}`, taskContext].filter(Boolean).join('\n\n');
  };

  const summarizeTaskExecution = (task) => {
    const type = sanitizeTaskText(task.type || 'product_analysis', 'product_analysis', 80);
    const priority = normalizeTaskPriority(task.priority);
    const description = sanitizeTaskText(task.description, '', 500);
    const input = task.input && typeof task.input === 'object' ? task.input : {};
    const evidence = [];
    let result = '';
    let requiresApproval = false;

    if (type === 'product_analysis') {
      result = `Produktanalyse erstellt. ${description || 'Produktdaten wurden geprüft.'}`;
      evidence.push(`Quelle: ${input.source || 'task-center-form'}`);
      evidence.push(`Priorität: ${priority}`);
    } else if (type === 'listing_review') {
      result = `Listing-Review abgeschlossen. Titel, Struktur und Klarheit wurden bewertet.`;
      requiresApproval = true;
      evidence.push('Empfehlung: vor Veröffentlichung manuell prüfen.');
    } else if (type === 'margin_check') {
      result = `Margen-Check abgeschlossen. Kosten, Preis und Puffer wurden strukturiert abgeglichen.`;
      evidence.push('Hinweis: Zahlen bleiben lokal verarbeitet.');
    } else if (type === 'customer_reply_draft') {
      result = `Antwortentwurf erstellt. Tonalität, Klarheit und Hilfsbereitschaft wurden berücksichtigt.`;
      requiresApproval = true;
      evidence.push('Entwurf bleibt freigabe-pflichtig.');
    } else if (type === 'supplier_check') {
      result = `Lieferantenprüfung abgeschlossen. Verfügbarkeit, Risiko und nächste Schritte wurden vorbereitet.`;
      requiresApproval = true;
      evidence.push('Lieferantenarbeitsschritt erfordert spätere Freigabe.');
    } else if (type === 'research' || type === 'seo_audit' || type === 'risk_audit' || type === 'support_summary' || type === 'operations_check') {
      result = `Agentenauftrag ${type} verarbeitet. Analysepfad und Ergebnistext wurden erzeugt.`;
      if (type === 'risk_audit' || type === 'support_summary' || type === 'operations_check') {
        requiresApproval = true;
      }
      evidence.push(`Agentenmodus: ${task.agentId || 'ohne Agent'}`);
    } else {
      result = `Aufgabe ${task.title || task.id} verarbeitet.`;
    }

    return {
      result,
      requiresApproval,
      evidence,
      context: {
        agentId: task.agentId || '',
        agentType: task.agentType || '',
        type,
        priority,
        input,
      },
    };
  };

  const runAiTask = (taskId) => {
    const task = getAiTasks().find((item) => item && item.id === taskId);
    if (!task) return null;
    const lockedByPause = isAllAgentsPaused();
    const securityBlocked = state.securityMode !== false || state.sandboxMode !== false || state.autonomyLocked !== false;
    const effectivePrompt = buildEffectiveAgentPrompt(task.agentId, task);
    createAiEvent({ type: 'task.started', source: 'runner', payload: { taskId: task.id }, relatedTaskId: task.id });
    createAiLog({
      level: lockedByPause || securityBlocked ? 'security' : 'info',
      message: `Task gestartet: ${task.title}`,
      taskId: task.id,
      agentId: task.agentId,
      context: { lockedByPause, securityBlocked, effectivePrompt },
    });
    if (lockedByPause) {
      createAiEvent({ type: 'agent.paused', source: 'runner', payload: { reason: 'pauseAllAgents' }, relatedTaskId: task.id });
      const blocked = blockAiTask(task.id, 'Alle Agenten sind pausiert.');
      createAiEvent({ type: 'task.blocked', source: 'runner', payload: { reason: 'pauseAllAgents' }, relatedTaskId: task.id });
      return blocked;
    }
    const execution = summarizeTaskExecution(task);
    updateAiTask(task.id, { status: 'running', startedAt: nowIso(), updatedAt: nowIso() });
    createAiLog({
      level: 'info',
      message: `Kontext geladen für ${task.title}`,
      taskId: task.id,
      agentId: task.agentId,
      context: execution.context,
    });
    if (securityBlocked) {
      const result = `${execution.result} ${AI_TASK_LIVE_HINT}`;
      const nextStatus = execution.requiresApproval ? 'waiting_approval' : 'blocked';
      createAiEvent({ type: 'approval.required', source: 'runner', payload: { reason: 'security_mode', taskId: task.id }, relatedTaskId: task.id });
      updateAiTask(task.id, { status: nextStatus, result, finishedAt: nowIso(), updatedAt: nowIso(), logs: execution.evidence });
      createAiEvent({ type: 'task.blocked', source: 'runner', payload: { reason: 'security_mode', result, nextStatus }, relatedTaskId: task.id });
      createAiLog({ level: 'security', message: result, taskId: task.id, agentId: task.agentId, context: { effectivePrompt, evidence: execution.evidence } });
      return getAiTasks().find((item) => item && item.id === task.id) || task;
    }
    const result = execution.result;
    completeAiTask(task.id, result);
    updateAiTask(task.id, { logs: execution.evidence });
    createAiEvent({ type: 'task.completed', source: 'runner', payload: { result, evidence: execution.evidence }, relatedTaskId: task.id });
    createAiLog({ level: 'info', message: result, taskId: task.id, agentId: task.agentId, context: { effectivePrompt, evidence: execution.evidence } });
    return getAiTasks().find((item) => item && item.id === task.id) || task;
  };

  const normalizeSecurityMode = (source) => {
    if (typeof source.securityMode === 'boolean') return source.securityMode;
    if (typeof source.safetyMode === 'boolean') return source.safetyMode;
    return true;
  };

  const createFutureCapabilityState = () => ({
    lockedFunctions: FUTURE_CAPABILITY_DEFS.lockedFunctions.reduce((acc, item) => {
      const pipelineType = getDefaultFuturePipelineType('lockedFunctions', item.id);
      const blueprint = getLiveActionBlueprint(pipelineType);
      acc[item.id] = {
        prepared: true,
        enabled: false,
        lastPreparedAt: '',
        notes: '',
        settings: {
          priority: 'medium',
          mode: 'manual',
          customLabel: '',
          pipelineType,
          connector: blueprint.connector,
        },
      };
      return acc;
    }, {}),
    lockedRoles: FUTURE_CAPABILITY_DEFS.lockedRoles.reduce((acc, item) => {
      const pipelineType = getDefaultFuturePipelineType('lockedRoles', item.id);
      const blueprint = getLiveActionBlueprint(pipelineType);
      acc[item.id] = {
        prepared: true,
        enabled: false,
        lastPreparedAt: '',
        notes: '',
        settings: {
          priority: 'medium',
          mode: 'manual',
          customLabel: '',
          pipelineType,
          connector: blueprint.connector,
        },
      };
      return acc;
    }, {}),
  });

  const mergeFutureCapabilityState = (kind, defaults, saved) => {
    const source = saved && typeof saved === 'object' ? saved : {};
    return Object.keys(defaults || {}).reduce((acc, key) => {
      const fallback = defaults[key] && typeof defaults[key] === 'object' ? defaults[key] : {};
      const incoming = source[key] && typeof source[key] === 'object' ? source[key] : {};
      acc[key] = {
        prepared: typeof incoming.prepared === 'boolean' ? incoming.prepared : fallback.prepared === true,
        enabled: typeof incoming.enabled === 'boolean' ? incoming.enabled : fallback.enabled === true,
        lastPreparedAt: typeof incoming.lastPreparedAt === 'string' ? incoming.lastPreparedAt : (typeof fallback.lastPreparedAt === 'string' ? fallback.lastPreparedAt : ''),
        notes: typeof incoming.notes === 'string' ? incoming.notes : (typeof fallback.notes === 'string' ? fallback.notes : ''),
        settings: {
          priority: typeof incoming.settings === 'object' && incoming.settings && typeof incoming.settings.priority === 'string'
            ? incoming.settings.priority
            : (fallback.settings && typeof fallback.settings.priority === 'string' ? fallback.settings.priority : 'medium'),
          mode: typeof incoming.settings === 'object' && incoming.settings && typeof incoming.settings.mode === 'string'
            ? incoming.settings.mode
            : (fallback.settings && typeof fallback.settings.mode === 'string' ? fallback.settings.mode : 'manual'),
          customLabel: typeof incoming.settings === 'object' && incoming.settings && typeof incoming.settings.customLabel === 'string'
            ? incoming.settings.customLabel
            : (fallback.settings && typeof fallback.settings.customLabel === 'string' ? fallback.settings.customLabel : ''),
          pipelineType: typeof incoming.settings === 'object' && incoming.settings && typeof incoming.settings.pipelineType === 'string'
            ? incoming.settings.pipelineType
            : (fallback.settings && typeof fallback.settings.pipelineType === 'string' ? fallback.settings.pipelineType : getDefaultFuturePipelineType(kind, key)),
          connector: typeof incoming.settings === 'object' && incoming.settings && typeof incoming.settings.connector === 'string'
            ? incoming.settings.connector
            : (fallback.settings && typeof fallback.settings.connector === 'string' ? fallback.settings.connector : getLiveActionBlueprint(getDefaultFuturePipelineType(kind, key)).connector),
        },
      };
      return acc;
    }, {});
  };

  const createDefaultAgentRuntime = () => ({});
  const normalizeAgentRuntime = (rawRuntime) => {
    if (!rawRuntime || typeof rawRuntime !== 'object' || Array.isArray(rawRuntime)) {
      return createDefaultAgentRuntime();
    }
    return { ...rawRuntime };
  };

  const createDefaultState = () => ({
    version: 4,
    securityMode: true,
    sandboxMode: true,
    advancedMode: false,
    autonomyLocked: true,
    pauseAllAgents: false,
    pauseAllSnapshot: {},
    masterAgentsDisabled: false,
    masterAgentsSnapshot: {},
    safetyMode: true,
    pausedAll: false,
    activePanel: 'overview',
    openCards: {},
    agentRuntime: createDefaultAgentRuntime(),
    orderWorkflow: {...ORDER_WORKFLOW_DEFAULTS},
    futureDetailsOpen: {},
    descriptionEditing: {},
    promptEditing: {},
    guardrailsEditing: {},
    extendedAutonomyPanels: { feature: true, role: true },
    extendedAutonomyFeatures: EXTENDED_AUTONOMY_FEATURE_DEFS.map((item) => ({
      id: item.id,
      kind: item.kind,
      icon: item.icon,
      title: item.title,
      description: item.description,
      status: 'locked',
      config: { ...(item.config || {}) },
    })),
    extendedAutonomyRoles: EXTENDED_AUTONOMY_ROLE_DEFS.map((item) => ({
      id: item.id,
      kind: item.kind,
      icon: item.icon,
      title: item.title,
      description: item.description,
      status: 'locked',
      config: { ...(item.config || {}) },
    })),
    groupPrompts: { ...GROUP_PROMPT_DEFAULTS },
    aiTasks: [],
    agents: AGENT_DEFS.reduce((acc, def) => {
      acc[def.id] = {
        active: true,
        mode: 'suggestions',
        notifications: true,
        model: 'deepseek',
        dailyLimit: 0.25,
        description: def.description || def.task,
        prompt: def.prompt || '',
        generatedPromptTemplates: [],
        statusState: 'Idle',
        usageToday: 0,
        lastActivity: DEFAULT_ACTIVITY,
        lastTestResponse: DEFAULT_TEST_RESPONSE,
        lastTestedAt: '',
      };
      return acc;
    }, {}),
  });

  const getExtendedAutonomyDefaults = (type) => (type === 'role' ? EXTENDED_AUTONOMY_ROLE_DEFS : EXTENDED_AUTONOMY_FEATURE_DEFS);
  const getExtendedAutonomySettingDefinition = (type, itemId) => {
    const group = EXTENDED_AUTONOMY_SETTING_DEFS[type] || {};
    return group[itemId] || null;
  };

  const normalizeExtendedAutonomyConfig = (rawConfig, type, itemId) => {
    const def = getExtendedAutonomySettingDefinition(type, itemId);
    const fallback = def && def.fields ? { ...(def.config || {}) } : {};
    const source = rawConfig && typeof rawConfig === 'object' ? rawConfig : {};
    if (type === 'role') {
      return {
        responsibleArea: AUTONOMY_AREA_OPTIONS.some((item) => item.value === source.responsibleArea)
          ? source.responsibleArea
          : (AUTONOMY_AREA_OPTIONS.some((item) => item.value === fallback.responsibleArea) ? fallback.responsibleArea : 'all'),
        scope: ROLE_SCOPE_OPTIONS.some((item) => item.value === source.scope) ? source.scope : (fallback.scope || 'review'),
        canApprove: typeof source.canApprove === 'boolean' ? source.canApprove : (typeof fallback.canApprove === 'boolean' ? fallback.canApprove : false),
        canLock: typeof source.canLock === 'boolean' ? source.canLock : (typeof fallback.canLock === 'boolean' ? fallback.canLock : true),
        priority: ROLE_PRIORITY_OPTIONS.some((item) => item.value === source.priority) ? source.priority : (fallback.priority || 'medium'),
        riskFocus: ['compliance', 'margin', 'delivery'].includes(source.riskFocus) ? source.riskFocus : (fallback.riskFocus || 'compliance'),
        workflowScope: ['orders', 'messages', 'posting', 'all'].includes(source.workflowScope) ? source.workflowScope : (fallback.workflowScope || 'all'),
        supportScope: ['messages', 'returns', 'both'].includes(source.supportScope) ? source.supportScope : (fallback.supportScope || 'both'),
        prompt: sanitizePromptText(source.prompt !== undefined ? source.prompt : fallback.prompt || '', fallback.prompt || ''),
        generatedPromptTemplates: sanitizePromptTemplateList(source.generatedPromptTemplates !== undefined ? source.generatedPromptTemplates : fallback.generatedPromptTemplates || []),
        note: sanitizeActivity(source.note !== undefined ? source.note : fallback.note || '', ''),
      };
    }
    return {
      targetArea: AUTONOMY_AREA_OPTIONS.some((item) => item.value === source.targetArea)
        ? source.targetArea
        : (AUTONOMY_AREA_OPTIONS.some((item) => item.value === fallback.targetArea) ? fallback.targetArea : 'all'),
      mode: FEATURE_MODE_OPTIONS.some((item) => item.value === source.mode) ? source.mode : (fallback.mode || 'manual'),
      approvalRule: ['manual_review', 'guided', 'automatic'].includes(source.approvalRule) ? source.approvalRule : (fallback.approvalRule || 'manual_review'),
      threshold: FEATURE_THRESHOLD_OPTIONS.some((item) => item.value === source.threshold) ? source.threshold : (fallback.threshold || 'medium'),
      autoStart: typeof source.autoStart === 'boolean' ? source.autoStart : (typeof fallback.autoStart === 'boolean' ? fallback.autoStart : false),
      requireSafetyCheck: typeof source.requireSafetyCheck === 'boolean' ? source.requireSafetyCheck : (typeof fallback.requireSafetyCheck === 'boolean' ? fallback.requireSafetyCheck : false),
      supplierGuard: ['strict', 'normal', 'relaxed'].includes(source.supplierGuard) ? source.supplierGuard : (fallback.supplierGuard || 'normal'),
      maxOrderValue: ['50', '100', '250'].includes(String(source.maxOrderValue)) ? String(source.maxOrderValue) : (fallback.maxOrderValue || '100'),
      requireStockCheck: typeof source.requireStockCheck === 'boolean' ? source.requireStockCheck : (typeof fallback.requireStockCheck === 'boolean' ? fallback.requireStockCheck : false),
      tone: ['friendly', 'neutral', 'direct'].includes(source.tone) ? source.tone : (fallback.tone || 'friendly'),
      escalation: ['low', 'medium', 'high'].includes(source.escalation) ? source.escalation : (fallback.escalation || 'medium'),
      allowAutoReply: typeof source.allowAutoReply === 'boolean' ? source.allowAutoReply : (typeof fallback.allowAutoReply === 'boolean' ? fallback.allowAutoReply : false),
      requireReview: typeof source.requireReview === 'boolean' ? source.requireReview : (typeof fallback.requireReview === 'boolean' ? fallback.requireReview : true),
      publishGate: ['manual', 'score_80', 'score_90'].includes(source.publishGate) ? source.publishGate : (fallback.publishGate || 'manual'),
      imageCheck: typeof source.imageCheck === 'boolean' ? source.imageCheck : (typeof fallback.imageCheck === 'boolean' ? fallback.imageCheck : false),
      prompt: sanitizePromptText(source.prompt !== undefined ? source.prompt : fallback.prompt || '', fallback.prompt || ''),
      generatedPromptTemplates: sanitizePromptTemplateList(source.generatedPromptTemplates !== undefined ? source.generatedPromptTemplates : fallback.generatedPromptTemplates || []),
      note: sanitizeActivity(source.note !== undefined ? source.note : fallback.note || '', ''),
    };
  };

  const normalizeExtendedAutonomyItems = (rawItems, defs, type) => {
    const list = Array.isArray(rawItems) ? rawItems : [];
    const byId = new Map();
    list.forEach((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item) || !item.id) return;
      byId.set(String(item.id), item);
    });
    return defs.map((def) => {
      const incoming = byId.get(def.id) || {};
      return {
        id: def.id,
        kind: def.kind || type,
        icon: def.icon,
        title: def.title,
        description: def.description,
        status: incoming.status === 'active' ? 'active' : 'locked',
        config: normalizeExtendedAutonomyConfig(incoming.config, def.kind || type, def.id),
      };
    });
  };

  const normalizeState = (raw) => {
    const defaults = createDefaultState();
    const source = raw && typeof raw === 'object' ? raw : {};
    const next = {
      version: Number.isFinite(Number(source.version)) ? Math.max(Number(defaults.version) || 1, Number(source.version) || 1) : defaults.version,
      securityMode: typeof source.securityMode === 'boolean' ? source.securityMode : source.safetyMode !== false,
      sandboxMode: typeof source.sandboxMode === 'boolean' ? source.sandboxMode : defaults.sandboxMode,
      advancedMode: typeof source.advancedMode === 'boolean' ? source.advancedMode : defaults.advancedMode,
      autonomyLocked: typeof source.autonomyLocked === 'boolean' ? source.autonomyLocked : defaults.autonomyLocked,
      pauseAllAgents: typeof source.pauseAllAgents === 'boolean' ? source.pauseAllAgents : source.pausedAll === true,
      pauseAllSnapshot: source.pauseAllSnapshot && typeof source.pauseAllSnapshot === 'object' ? {...source.pauseAllSnapshot} : {},
      masterAgentsDisabled: typeof source.masterAgentsDisabled === 'boolean' ? source.masterAgentsDisabled : defaults.masterAgentsDisabled,
      masterAgentsSnapshot: source.masterAgentsSnapshot && typeof source.masterAgentsSnapshot === 'object' ? {...source.masterAgentsSnapshot} : {},
      safetyMode: typeof source.safetyMode === 'boolean' ? source.safetyMode : (typeof source.securityMode === 'boolean' ? source.securityMode : defaults.safetyMode),
      pausedAll: typeof source.pausedAll === 'boolean' ? source.pausedAll : (typeof source.pauseAllAgents === 'boolean' ? source.pauseAllAgents : source.pausedAll === true),
      activePanel: normalizePanel(source.activePanel || defaults.activePanel),
      openCards: source.openCards && typeof source.openCards === 'object' ? {...source.openCards} : {},
      agentRuntime: normalizeAgentRuntime(source.agentRuntime),
      orderWorkflow: {
        enabled: typeof source.orderWorkflow === 'object' && source.orderWorkflow ? source.orderWorkflow.enabled === true : defaults.orderWorkflow.enabled,
        mode: typeof source.orderWorkflow === 'object' && source.orderWorkflow && typeof source.orderWorkflow.mode === 'string' && source.orderWorkflow.mode === 'manual' ? 'manual' : 'semi',
        autoInvoice: typeof source.orderWorkflow === 'object' && source.orderWorkflow ? source.orderWorkflow.autoInvoice !== false : defaults.orderWorkflow.autoInvoice,
        autoShippingTask: typeof source.orderWorkflow === 'object' && source.orderWorkflow ? source.orderWorkflow.autoShippingTask !== false : defaults.orderWorkflow.autoShippingTask,
        autoSyncGoogleSheets: typeof source.orderWorkflow === 'object' && source.orderWorkflow ? source.orderWorkflow.autoSyncGoogleSheets === true : defaults.orderWorkflow.autoSyncGoogleSheets,
        autoQueueReview: typeof source.orderWorkflow === 'object' && source.orderWorkflow ? source.orderWorkflow.autoQueueReview !== false : defaults.orderWorkflow.autoQueueReview,
        note: resolveOrderWorkflowNote(typeof source.orderWorkflow === 'object' && source.orderWorkflow && typeof source.orderWorkflow.note === 'string' ? source.orderWorkflow.note : defaults.orderWorkflow.note),
        noteLocked: typeof source.orderWorkflow === 'object' && source.orderWorkflow && typeof source.orderWorkflow.noteLocked === 'boolean' ? source.orderWorkflow.noteLocked : true,
        lastRunAt: typeof source.orderWorkflow === 'object' && source.orderWorkflow && typeof source.orderWorkflow.lastRunAt === 'string' ? source.orderWorkflow.lastRunAt : defaults.orderWorkflow.lastRunAt,
        preparedPlans: typeof source.orderWorkflow === 'object' && source.orderWorkflow && Array.isArray(source.orderWorkflow.preparedPlans)
          ? source.orderWorkflow.preparedPlans
          : defaults.orderWorkflow.preparedPlans,
      },
      futureDetailsOpen: source.futureDetailsOpen && typeof source.futureDetailsOpen === 'object' ? {
        lockedFunctions: source.futureDetailsOpen.lockedFunctions && typeof source.futureDetailsOpen.lockedFunctions === 'object' ? {...source.futureDetailsOpen.lockedFunctions} : {},
        lockedRoles: source.futureDetailsOpen.lockedRoles && typeof source.futureDetailsOpen.lockedRoles === 'object' ? {...source.futureDetailsOpen.lockedRoles} : {},
      } : {
        lockedFunctions: {},
        lockedRoles: {},
      },
      descriptionEditing: source.descriptionEditing && typeof source.descriptionEditing === 'object' ? {...source.descriptionEditing} : {},
      promptEditing: source.promptEditing && typeof source.promptEditing === 'object' ? {...source.promptEditing} : {},
      guardrailsEditing: source.guardrailsEditing && typeof source.guardrailsEditing === 'object' ? {...source.guardrailsEditing} : {},
      extendedAutonomyPanels: source.extendedAutonomyPanels && typeof source.extendedAutonomyPanels === 'object'
        ? {
            feature: source.extendedAutonomyPanels.feature !== false,
            role: source.extendedAutonomyPanels.role !== false,
          }
        : {...defaults.extendedAutonomyPanels},
      extendedAutonomyFeatures: normalizeExtendedAutonomyItems(source.extendedAutonomyFeatures, EXTENDED_AUTONOMY_FEATURE_DEFS, 'feature'),
      extendedAutonomyRoles: normalizeExtendedAutonomyItems(source.extendedAutonomyRoles, EXTENDED_AUTONOMY_ROLE_DEFS, 'role'),
      groupPrompts: {
        'ki-agents': (() => {
          const rawValue = source.groupPrompts && source.groupPrompts['ki-agents'] !== undefined
            ? source.groupPrompts['ki-agents']
            : defaults.groupPrompts['ki-agents'];
          const nextValue = sanitizePromptText(rawValue, GROUP_PROMPT_DEFAULTS['ki-agents']);
          return !nextValue || nextValue === GROUP_PROMPT_LEGACY_DEFAULTS['ki-agents']
            ? GROUP_PROMPT_DEFAULTS['ki-agents']
            : nextValue;
        })(),
        'virtual-ma': (() => {
          const rawValue = source.groupPrompts && source.groupPrompts['virtual-ma'] !== undefined
            ? source.groupPrompts['virtual-ma']
            : defaults.groupPrompts['virtual-ma'];
          const nextValue = sanitizePromptText(rawValue, GROUP_PROMPT_DEFAULTS['virtual-ma']);
          return !nextValue || nextValue === GROUP_PROMPT_LEGACY_DEFAULTS['virtual-ma']
            ? GROUP_PROMPT_DEFAULTS['virtual-ma']
            : nextValue;
        })(),
      },
      aiTasks: normalizeAiTasks(source.aiTasks),
      agents: {},
    };

    AGENT_DEFS.forEach((def) => {
      const incoming = source.agents && typeof source.agents === 'object' ? source.agents[def.id] : null;
      const fallback = defaults.agents[def.id];
      next.agents[def.id] = {
        active: incoming && typeof incoming.active === 'boolean' ? incoming.active : fallback.active,
        mode: normalizeMode(incoming && incoming.mode !== undefined ? incoming.mode : fallback.mode),
        notifications: incoming && typeof incoming.notifications === 'boolean' ? incoming.notifications : fallback.notifications,
        model: normalizeModel(incoming && incoming.model !== undefined ? incoming.model : fallback.model),
        dailyLimit: normalizeLimit(incoming && incoming.dailyLimit !== undefined ? incoming.dailyLimit : fallback.dailyLimit),
        description: sanitizeDescription(incoming && incoming.description !== undefined ? incoming.description : fallback.description, def.description || def.task),
        prompt: sanitizePromptText(
          incoming && incoming.prompt !== undefined ? incoming.prompt : (fallback.prompt || def.prompt || ''),
          def.prompt || '',
        ),
        generatedPromptTemplates: sanitizePromptTemplateList(
          incoming && incoming.generatedPromptTemplates !== undefined
            ? incoming.generatedPromptTemplates
            : (fallback.generatedPromptTemplates || []),
        ),
        statusState: normalizeStatusState(incoming && incoming.statusState !== undefined ? incoming.statusState : fallback.statusState),
        usageToday: normalizeUsage(incoming && incoming.usageToday !== undefined ? incoming.usageToday : fallback.usageToday),
        lastActivity: sanitizeActivity(incoming && incoming.lastActivity !== undefined ? incoming.lastActivity : fallback.lastActivity, DEFAULT_ACTIVITY),
        lastTestResponse: sanitizeActivity(incoming && incoming.lastTestResponse !== undefined ? incoming.lastTestResponse : fallback.lastTestResponse, DEFAULT_TEST_RESPONSE),
        lastTestedAt: sanitizeActivity(incoming && incoming.lastTestedAt !== undefined ? incoming.lastTestedAt : fallback.lastTestedAt, ''),
      };
    });

    next.safetyMode = next.securityMode;
    next.pausedAll = next.pauseAllAgents || next.pausedAll;
    next.pauseAllSnapshot = next.pauseAllSnapshot && typeof next.pauseAllSnapshot === 'object' ? next.pauseAllSnapshot : {};
    next.masterAgentsDisabled = next.masterAgentsDisabled === true;
    next.masterAgentsSnapshot = next.masterAgentsSnapshot && typeof next.masterAgentsSnapshot === 'object' ? next.masterAgentsSnapshot : {};
    return next;
  };

  const loadState = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      const state = normalizeState(parsed);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return state;
    } catch (error) {
      const fallback = createDefaultState();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback));
      return fallback;
    }
  };

  const state = loadState();
  loadAiWorkflowFromServer().then(() => {
    render();
  });
  let activePanel = normalizePanel(state.activePanel);
  let taskStatusFilter = 'all';
  let taskPriorityFilter = 'all';
  let taskCenterNotice = '';
  let taskRemovalTargetId = '';
  let advancedAutonomyHoldTimer = null;
  let advancedAutonomyHoldFrame = null;
  let advancedAutonomyHoldStart = 0;
  let advancedAutonomyHoldActive = false;
  let activeExtendedAutonomySetting = { type: 'feature', id: '' };
  let activeAgentPromptSetting = '';
  let activeGroupPromptSetting = '';

  const saveState = () => {
    state.activePanel = activePanel;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  };

  const isSecurityLocked = () => state.securityMode !== false || state.sandboxMode !== false;
  const isAutonomyLocked = () => state.autonomyLocked !== false;
  const isAllAgentsPaused = () => state.pauseAllAgents === true || state.pausedAll === true;
  const isAdvancedAutonomyUnlocked = () => state.advancedMode === true && state.autonomyLocked === false;
  const isMasterAgentsDisabled = () => state.masterAgentsDisabled === true;
  const isExtendedAutonomyEnabled = () => isAdvancedAutonomyUnlocked();
  const getExtendedAutonomyCollection = (type) => (type === 'role' ? state.extendedAutonomyRoles : state.extendedAutonomyFeatures) || [];
  const getExtendedAutonomyTypeLabel = (type) => (type === 'role' ? 'Rolle' : 'Funktion');
  const getExtendedAutonomyPluralLabel = (type) => (type === 'role' ? 'Rollen' : 'Funktionen');
  const optionLabelFor = (options, value, fallback) => {
    const option = Array.isArray(options) ? options.find((item) => item.value === value) : null;
    return option ? option.label : fallback;
  };
  const getExtendedAutonomyModeLabel = (type, value, itemId) => {
    if (type === 'role') {
      const def = getExtendedAutonomySettingDefinition(type, itemId);
      const scopeField = def && def.fields ? def.fields.find((field) => field.key === 'scope') : null;
      return optionLabelFor(scopeField && scopeField.options, value, 'Nur prüfen');
    }
    const def = getExtendedAutonomySettingDefinition(type, itemId);
    const modeField = def && def.fields ? def.fields.find((field) => field.key === 'mode') : null;
    return optionLabelFor(modeField && modeField.options, value, 'Mit Bestätigung');
  };
  const getExtendedAutonomyFieldLabel = (type, itemId, key, value, fallback) => {
    const def = getExtendedAutonomySettingDefinition(type, itemId);
    const field = def && def.fields ? def.fields.find((entry) => entry.key === key) : null;
    return optionLabelFor(field && field.options, value, fallback);
  };
  const getAutonomyAreaLabel = (value) => optionLabelFor(AUTONOMY_AREA_OPTIONS, value, 'Alle Bereiche');
  const previewPromptText = (value, max = 58) => {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    if (!text) return '';
    return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
  };
  const getAutonomyLinksForArea = (area) => {
    const featureLinks = (state.extendedAutonomyFeatures || [])
      .filter((item) => {
        const target = item.config && item.config.targetArea;
        return target === area || target === 'all';
      })
      .map((item) => item.title);
    const roleLinks = (state.extendedAutonomyRoles || [])
      .filter((item) => {
        const target = item.config && item.config.responsibleArea;
        return target === area || target === 'all';
      })
      .map((item) => item.title);
    return {
      features: featureLinks,
      roles: roleLinks,
    };
  };
  const getExtendedAutonomyCardSummary = (type, item) => {
    const config = item.config || {};
    if (type === 'role') {
      const scope = getExtendedAutonomyModeLabel(type, config.scope, item.id);
      const priority = getExtendedAutonomyFieldLabel(type, item.id, 'priority', config.priority, 'Mittel');
      const area = getAutonomyAreaLabel(config.responsibleArea);
      const prompt = previewPromptText(config.prompt);
      const rightLabel = config.canApprove ? 'Freigeben' : 'Nur prüfen';
      const lockLabel = config.canLock ? 'Sperren' : 'Nur freigeben';
      return [
        `Zuständig: ${area}`,
        `Freigabelevel: ${scope}`,
        `Rechte: ${rightLabel} · ${lockLabel}`,
        `Priorität: ${priority}`,
        prompt ? `Prompt: ${prompt}` : 'Prompt: Keine Vorlage',
      ];
    }
    const area = getAutonomyAreaLabel(config.targetArea);
    const mode = getExtendedAutonomyModeLabel(type, config.mode, item.id);
    const prompt = previewPromptText(config.prompt);
    const gate = getExtendedAutonomyFieldLabel(type, item.id, 'approvalRule', config.approvalRule, 'Manuell prüfen');
    const threshold = getExtendedAutonomyFieldLabel(type, item.id, 'threshold', config.threshold, 'Mittel');
    const secondLine = item.id === 'auto-posting'
      ? `Gate: ${getExtendedAutonomyFieldLabel(type, item.id, 'publishGate', config.publishGate, 'Nur manuell')}`
      : item.id === 'auto-orders'
        ? `Supplier: ${getExtendedAutonomyFieldLabel(type, item.id, 'supplierGuard', config.supplierGuard, 'Normal')}`
        : item.id === 'auto-messages'
          ? `Ton: ${getExtendedAutonomyFieldLabel(type, item.id, 'tone', config.tone, 'Freundlich')}`
          : `Policy: ${gate}`;
    return [
      `Verknüpft: ${area}`,
      `Modus: ${mode}`,
      secondLine,
      `Autostart: ${config.autoStart ? 'Ja' : 'Nein'}`,
      prompt ? `Prompt: ${prompt}` : 'Prompt: Keine Vorlage',
    ];
  };
  const isExtendedAutonomyCollectionOpen = (type) => state.extendedAutonomyPanels && state.extendedAutonomyPanels[type] !== false;
  const setExtendedAutonomyCollectionOpen = (type, isOpen) => {
    state.extendedAutonomyPanels = state.extendedAutonomyPanels && typeof state.extendedAutonomyPanels === 'object'
      ? {...state.extendedAutonomyPanels}
      : { feature: true, role: true };
    state.extendedAutonomyPanels[type] = !!isOpen;
  };
  const setExtendedAutonomyCollection = (type, items) => {
    if (type === 'role') {
      state.extendedAutonomyRoles = items;
      return;
    }
    state.extendedAutonomyFeatures = items;
  };
  const updateExtendedAutonomyItem = (type, itemId, patch) => {
    const collection = getExtendedAutonomyCollection(type);
    let changed = false;
    const next = collection.map((item) => {
      if (item.id !== itemId) return item;
      changed = true;
      return {
        ...item,
        ...patch,
        config: patch && patch.config ? { ...(item.config || {}), ...patch.config } : (item.config || {}),
      };
    });
    if (!changed) return false;
    setExtendedAutonomyCollection(type, next);
    saveState();
    render();
    return true;
  };
   const handleFutureButtonAction = (event, kind, id, action) => {
     if (event && typeof event.preventDefault === 'function') event.preventDefault();
     if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
     if (action === 'settings') {
       openFutureSettingsModal(kind, id);
     } else {
       toggleFutureCapability(kind, id);
     }
     return false;
   };
   const toggleFutureCapability = (kind, id) => {
     if (!isFutureCapabilityUnlocked()) {
       showSecurityBlockedNotice('Das Entsperren der Zukunftsfunktionen');
       return;
     }
    const collection = kind === 'lockedRoles' ? FUTURE_CAPABILITY_DEFS.lockedRoles : FUTURE_CAPABILITY_DEFS.lockedFunctions;
    const def = Array.isArray(collection) ? collection.find((item) => item.id === id) : null;
    if (!def) return;
    state.futureCapabilities = state.futureCapabilities && typeof state.futureCapabilities === 'object' ? state.futureCapabilities : createFutureCapabilityState();
    state.futureCapabilities[kind] = state.futureCapabilities[kind] && typeof state.futureCapabilities[kind] === 'object' ? state.futureCapabilities[kind] : {};
    const current = getFutureCapabilityRecord(kind, id);
    const nextEnabled = !current.enabled;
    state.futureCapabilities[kind][id] = {
      prepared: true,
      enabled: nextEnabled,
      lastPreparedAt: new Date().toISOString(),
      notes: nextEnabled ? `${def.title} entsperrt.` : `${def.title} gesperrt.`,
      settings: current.settings && typeof current.settings === 'object'
        ? {
            priority: typeof current.settings.priority === 'string' ? current.settings.priority : 'medium',
            mode: typeof current.settings.mode === 'string' ? current.settings.mode : 'manual',
            customLabel: typeof current.settings.customLabel === 'string' ? current.settings.customLabel : '',
            pipelineType: typeof current.settings.pipelineType === 'string' ? current.settings.pipelineType : getDefaultFuturePipelineType(kind, id),
            connector: typeof current.settings.connector === 'string' ? current.settings.connector : getDefaultFuturePipelineBlueprint(kind, id).connector,
          }
        : {
            priority: 'medium',
            mode: 'manual',
            customLabel: '',
            pipelineType: getDefaultFuturePipelineType(kind, id),
            connector: getDefaultFuturePipelineBlueprint(kind, id).connector,
          },
    };
     setTaskCenterNotice(nextEnabled ? `${def.title} entsperrt.` : `${def.title} gesperrt.`);
     saveState();
     render();
     showToolPopup('Zukunftsfreigabe', `${def.title} wurde ${nextEnabled ? 'freigegeben' : 'gesperrt'}. Keine Live-Aktion wurde ausgeführt.`, 'good');
   };

  const getProductList = () => (Array.isArray(products) ? products : []);
  const getReturnList = () => [
    ...(Array.isArray(returns) ? returns : []),
    ...(Array.isArray(shopifyReturns) ? shopifyReturns : []),
  ];
  const getProductDisplayName = (product) => String(
    product && (product.name || product.title || product.productName || product.itemName || product.sku || 'Unbenanntes Produkt')
  ).trim() || 'Unbenanntes Produkt';
  const getProductInsight = (product) => {
    const calc = typeof calcProduct === 'function'
      ? calcProduct(product)
      : { profit: 0, score: 0, totalCost: 0, fee: 0, buffer: 0, recommendedPrice: 0 };
    const salesStats = typeof getSalesStatsForProduct === 'function'
      ? getSalesStatsForProduct(product && product.id)
      : { count: 0, revenue: 0 };
    const returnStats = typeof getReturnStatsForProduct === 'function'
      ? getReturnStatsForProduct(product && product.id)
      : { count: 0 };
    const delivery = Number(product && (product.delivery || product.deliveryTime || product.shippingTime)) || 0;
    const stock = Number(product && (product.stock || product.qty || product.quantity)) || 0;
    const title = getProductDisplayName(product);
    const maxDelivery = Number(appSettings && appSettings.maxDelivery) || 14;
    const supplierName = String(product && (product.supplierName || product.supplier || product.supplierId || '')).trim();
    const titleLength = title.length;
    const riskFlags = [
      titleLength < 45 ? 'Titel kurz' : '',
      titleLength > 80 ? 'Titel lang' : '',
      delivery > maxDelivery ? 'Lieferzeit hoch' : '',
      !supplierName ? 'Lieferant fehlt' : '',
      salesStats.count === 0 ? 'Noch keine Verkäufe' : '',
      returnStats.count > 0 ? 'Retouren vorhanden' : '',
      stock > 0 && stock <= 3 ? 'Niedriger Bestand' : '',
    ].filter(Boolean);
    return {
      product,
      title,
      calc,
      salesStats,
      returnStats,
      delivery,
      stock,
      supplierName,
      titleLength,
      riskFlags,
      score: Number(calc.score) || 0,
      profit: Number(calc.profit) || 0,
      margin: Number(calc.totalCost) > 0 ? (((Number(calc.profit) || 0) / Number(calc.totalCost)) * 100) : 0,
      maxDelivery,
    };
  };
  const upsertAiTaskRecord = (task) => {
    const items = Array.isArray(state.aiTasks) ? state.aiTasks.slice() : [];
    const normalized = normalizeAiTask(task, items.length);
    const index = items.findIndex((item) => item && item.id === normalized.id);
    if (index >= 0) {
      items[index] = { ...items[index], ...normalized };
    } else {
      items.unshift(normalized);
    }
    state.aiTasks = items;
    return normalized;
  };
  const upsertApprovalQueueRecord = (entry) => {
    const items = getApprovalQueue().slice();
    const normalized = normalizeApprovalQueueItem(entry, items.length);
    const index = items.findIndex((item) => item && item.id === normalized.id);
    if (index >= 0) {
      items[index] = { ...items[index], ...normalized };
    } else {
      items.unshift(normalized);
    }
    state.approvalQueue = items;
    return normalized;
  };
  const getOrderWorkflowSettings = () => {
    const workflow = state.orderWorkflow && typeof state.orderWorkflow === 'object' ? state.orderWorkflow : {};
    const preparedPlans = Array.isArray(workflow.preparedPlans) ? workflow.preparedPlans : [];
    return {
      enabled: workflow.enabled === true,
      mode: workflow.mode === 'manual' ? 'manual' : 'semi',
      autoInvoice: workflow.autoInvoice !== false,
      autoShippingTask: workflow.autoShippingTask !== false,
      autoSyncGoogleSheets: workflow.autoSyncGoogleSheets === true,
      autoQueueReview: workflow.autoQueueReview !== false,
      note: resolveOrderWorkflowNote(workflow.note || ''),
      noteLocked: workflow.noteLocked !== false,
      lastRunAt: sanitizeActivity(workflow.lastRunAt || '', ''),
      preparedPlans: preparedPlans.map((plan) => normalizeOrderWorkflowPlan(plan)),
    };
  };
  const saveOrderWorkflowSettings = (next) => {
    const current = getOrderWorkflowSettings();
    state.orderWorkflow = {
      ...current,
      ...(next && typeof next === 'object' ? next : {}),
      mode: next && next.mode === 'manual' ? 'manual' : (next && next.mode === 'semi' ? 'semi' : current.mode),
      enabled: next && typeof next.enabled === 'boolean' ? next.enabled : current.enabled,
      autoInvoice: next && typeof next.autoInvoice === 'boolean' ? next.autoInvoice : current.autoInvoice,
      autoShippingTask: next && typeof next.autoShippingTask === 'boolean' ? next.autoShippingTask : current.autoShippingTask,
      autoSyncGoogleSheets: next && typeof next.autoSyncGoogleSheets === 'boolean' ? next.autoSyncGoogleSheets : current.autoSyncGoogleSheets,
      autoQueueReview: next && typeof next.autoQueueReview === 'boolean' ? next.autoQueueReview : current.autoQueueReview,
      note: resolveOrderWorkflowNote(next && next.note !== undefined ? next.note : current.note),
      noteLocked: next && typeof next.noteLocked === 'boolean' ? next.noteLocked : current.noteLocked !== false,
      lastRunAt: sanitizeActivity(next && next.lastRunAt !== undefined ? next.lastRunAt : current.lastRunAt, ''),
      preparedPlans: Array.isArray(current.preparedPlans) ? current.preparedPlans.map((plan) => normalizeOrderWorkflowPlan(plan)) : [],
    };
    saveState();
    render();
  };
  const normalizeOrderWorkflowPlan = (plan) => {
    const source = plan && typeof plan === 'object' ? plan : {};
    const steps = Array.isArray(source.steps) ? source.steps : [];
    return {
      id: sanitizeActivity(source.id || '', ''),
      saleId: sanitizeActivity(source.saleId || '', ''),
      orderNo: sanitizeActivity(source.orderNo || '', ''),
      product: sanitizeActivity(source.product || '', ''),
      platform: sanitizeActivity(source.platform || '', ''),
      origin: sanitizeActivity(source.origin || '', ''),
      workflowMode: source.workflowMode === 'manual' ? 'manual' : 'semi',
      status: source.status === 'executed' ? 'executed' : (source.status === 'pending' ? 'pending' : 'prepared'),
      createdAt: sanitizeActivity(source.createdAt || '', ''),
      lastPreparedAt: sanitizeActivity(source.lastPreparedAt || '', ''),
      stepCount: Number.isFinite(Number(source.stepCount)) ? Number(source.stepCount) : steps.length,
      steps: steps.map((step, index) => {
        const normalizedStep = step && typeof step === 'object' ? step : {};
        return {
          id: sanitizeActivity(normalizedStep.id || `step-${index + 1}`, ''),
          title: sanitizeActivity(normalizedStep.title || '', ''),
          status: normalizedStep.status === 'executed' ? 'executed' : (normalizedStep.status === 'pending' ? 'pending' : 'prepared'),
          actionType: sanitizeActivity(normalizedStep.actionType || '', ''),
          connector: sanitizeActivity(normalizedStep.connector || '', ''),
          note: sanitizeActivity(normalizedStep.note || '', ''),
        };
      }),
    };
  };
  const buildOrderAutomationPlan = (sale, workflow, origin) => {
    if (!sale || !sale.id) return null;
    const createdAt = new Date().toISOString();
    const selectedWorkflow = workflow && typeof workflow === 'object' ? workflow : getOrderWorkflowSettings();
    const steps = [];
    const addStep = (id, title, actionType, connector, note) => {
      steps.push({
        id,
        title,
        status: 'prepared',
        actionType,
        connector,
        note,
      });
    };
    if (selectedWorkflow.autoInvoice) {
      addStep('invoice', 'Rechnung vorbereiten', 'listing_update', 'invoice-draft', 'Rechnung als Entwurf vorbereiten.');
    }
    if (selectedWorkflow.autoShippingTask) {
      addStep('shipping', 'Versand vorbereiten', 'order_prepare', 'supplier-order', 'Versandbearbeitung später freigeben.');
    }
    if (selectedWorkflow.autoQueueReview) {
      addStep('review', 'Bestellprüfung anstoßen', 'risk_action', 'risk-review', 'Offene Prüfung vorbereiten.');
    }
    if (selectedWorkflow.autoSyncGoogleSheets) {
      addStep('sync', 'Google Sheets Abgleich', 'risk_action', 'google-sheets-sync', 'Google Sheets Sync später ausführen.');
    }
    return normalizeOrderWorkflowPlan({
      id: `order-workflow-plan-${sale.id}`,
      saleId: sale.id,
      orderNo: sale.orderNo || '',
      product: sale.product || '',
      platform: sale.platform || 'eBay',
      origin: origin || 'manuell',
      workflowMode: selectedWorkflow.mode === 'manual' ? 'manual' : 'semi',
      status: 'prepared',
      createdAt,
      lastPreparedAt: createdAt,
      stepCount: steps.length,
      steps,
    });
  };
  const upsertOrderWorkflowPlan = (plan) => {
    const normalized = normalizeOrderWorkflowPlan(plan);
    if (!normalized.saleId) return null;
    const current = getOrderWorkflowSettings();
    const plans = Array.isArray(current.preparedPlans) ? current.preparedPlans.slice() : [];
    const index = plans.findIndex((item) => item && item.saleId === normalized.saleId);
    if (index >= 0) {
      plans[index] = normalized;
    } else {
      plans.unshift(normalized);
    }
    state.orderWorkflow = {
      ...current,
      preparedPlans: plans.slice(0, 25),
    };
    return normalized;
  };
  const orderWorkflowModeLabel = (mode) => (mode === 'manual' ? 'Manuell' : 'Halbautomatisch');
  const getOpenWorkflowSales = () => sales.filter((sale) => !['Abgeschlossen', 'Storniert'].includes(sale.status || 'Bezahlt'));
  const upsertOrderWorkflowApproval = (sale, stepType, title, description, previewText, riskLevel) => {
    if (!sale || !sale.id) return null;
    const id = `order-workflow-${sale.id}-${stepType}`;
    return upsertApprovalQueueRecord({
      id,
      title,
      description,
      agent: 'Order Workflow',
      type: stepType,
      status: 'pending',
      riskLevel: riskLevel || 'medium',
      createdAt: new Date().toISOString(),
      payload: decorateApprovalPayload(stepType, {
        source: 'order-workflow',
        saleId: sale.id,
        orderNo: sale.orderNo || '',
        product: sale.product || '',
        platform: sale.platform || 'eBay',
      }, {
        saleId: sale.id,
        saleOrderNo: sale.orderNo || '',
        workflow: 'order',
      }),
      previewText,
      requiresConfirmation: true,
    });
  };
  const upsertOrderWorkflowPlanApproval = (sale, plan, workflow, origin) => {
    if (!sale || !sale.id || !plan) return null;
    const planSteps = Array.isArray(plan.steps) ? plan.steps : [];
    const id = getOrderWorkflowApprovalEntryId(sale.id);
    const stepSummary = formatOrderWorkflowPlanSteps(plan);
    return upsertApprovalQueueRecord({
      id,
      title: `Bestellplan freigeben${sale.orderNo ? ` · ${sale.orderNo}` : ''}`,
      description: 'Der gespeicherte Bestellplan wird für spätere Live-Ausführung vorbereitet. Erst nach Freigabe kann ein echter Ausführungs-Haken greifen.',
      agent: 'Order Workflow',
      type: 'order_prepare',
      status: workflow && workflow.mode === 'manual' ? 'pending' : 'pending',
      riskLevel: 'high',
      createdAt: plan.lastPreparedAt || new Date().toISOString(),
      payload: decorateApprovalPayload('order_prepare', {
        source: 'order-workflow',
        saleId: sale.id,
        orderNo: sale.orderNo || '',
        product: sale.product || '',
        platform: sale.platform || 'eBay',
        origin: origin || 'manuell',
        orderWorkflowPlan: plan,
        orderWorkflowStepSummary: stepSummary,
        orderWorkflowStepCount: planSteps.length,
      }, {
        saleId: sale.id,
        saleOrderNo: sale.orderNo || '',
        workflow: 'order',
        orderWorkflowPlanId: id,
      }),
      previewText: `${sale.orderNo || sale.product || 'Bestellung'} · ${stepSummary}`,
      requiresConfirmation: true,
    });
  };
  const upsertOrderWorkflowTask = (sale, title, description, actionLabel, category) => {
    if (!sale || !sale.id) return null;
    const id = `order-workflow-task-${sale.id}-${category}`;
    return upsertAiTaskRecord({
      id,
      title,
      description,
      agent: 'Order Workflow',
      category: category || 'Bestellungen',
      priority: 'high',
      status: 'open',
      createdAt: new Date().toISOString(),
      source: 'order-workflow',
      actionLabel: actionLabel || 'Aufgabe öffnen',
    });
  };
  const runOrderWorkflowForSale = (sale, origin) => {
    const workflow = getOrderWorkflowSettings();
    if (!workflow.enabled || !sale) return null;
    const createdAt = new Date().toISOString();
    const stamp = new Date(createdAt).toLocaleString('de-DE');
    const note = workflow.note ? ` · ${workflow.note}` : '';
    const summary = [`${sale.orderNo || sale.product || 'Bestellung'}${origin ? ` · ${origin}` : ''}${note}`];
    const plan = buildOrderAutomationPlan(sale, workflow, origin);
    if (workflow.autoInvoice) {
      upsertOrderWorkflowTask(
        sale,
        'Rechnung vorbereiten',
        buildWorkflowSummaryText('Rechnung', [...summary, 'Entwurf als nächste Live-Stufe vorbereitet']),
        'Rechnung öffnen',
        'Rechnung'
      );
    }
    if (workflow.autoShippingTask) {
      upsertOrderWorkflowApproval(
        sale,
        'order_prepare',
        'Versand vorbereiten',
        'Die Bestellung wurde für die Versandbearbeitung vorgemerkt. Der Versand bleibt in der Versandzentrale und wird manuell oder halbautomatisch abgeschlossen.',
        `Versand für ${sale.orderNo || sale.product || 'Bestellung'} vorbereiten`,
        'medium'
      );
    }
    if (workflow.autoQueueReview) {
      upsertOrderWorkflowTask(
        sale,
        'Bestellprüfung anstoßen',
        buildWorkflowSummaryText('Bestellprüfung', ['Status prüfen', sale.shippingStatus || 'Noch nicht versendet', sale.returnFlag === 'open' ? 'Retoure offen' : '']),
        'Bestellprüfung öffnen',
        'Prüfung'
      );
    }
    if (workflow.autoSyncGoogleSheets) {
      upsertOrderWorkflowTask(
        sale,
        'Google Sheets Abgleich',
        buildWorkflowSummaryText('Sync', ['Verkäufe später mit Google Sheets abgleichen', sale.platform || 'eBay', stamp]),
        'Sync öffnen',
        'Sync'
      );
    }
    if (plan) {
      const preparedPlan = upsertOrderWorkflowPlan(plan);
      if (preparedPlan && plan.steps.length) {
        preparedPlan.lastPreparedAt = createdAt;
        preparedPlan.stepCount = plan.steps.length;
        preparedPlan.status = workflow.mode === 'manual' ? 'prepared' : 'pending';
        preparedPlan.steps = plan.steps.map((step) => ({ ...step }));
        upsertOrderWorkflowPlanApproval(sale, preparedPlan, workflow, origin);
      }
    }
    state.orderWorkflow = {
      ...state.orderWorkflow,
      ...workflow,
      lastRunAt: createdAt,
      preparedPlans: Array.isArray(state.orderWorkflow && state.orderWorkflow.preparedPlans) ? state.orderWorkflow.preparedPlans.map((item) => normalizeOrderWorkflowPlan(item)) : Array.isArray(workflow.preparedPlans) ? workflow.preparedPlans.map((item) => normalizeOrderWorkflowPlan(item)) : [],
    };
    saveState();
    render();
    return {
      saleId: sale.id,
      orderNo: sale.orderNo || '',
      createdAt,
    };
  };
  const runOrderWorkflowForSales = (items, origin) => {
    const list = Array.isArray(items) ? items : [];
    const results = list.map((sale) => runOrderWorkflowForSale(sale, origin)).filter(Boolean);
    return results;
  };
  const buildWorkflowSummaryText = (title, points) => {
    const filtered = Array.isArray(points) ? points.filter(Boolean) : [];
    return filtered.length ? `${title}: ${filtered.join(' · ')}` : `${title}: keine Auffälligkeiten gefunden.`;
  };

  const getAgent = (agentId) => state.agents[agentId] || null;
  const getDefinition = (agentId) => AGENT_DEFS.find((item) => item.id === agentId) || null;
  const AGENT_GROUP_PROMPT_LABELS = {
    'ki-agents': 'KI-Agenten',
    'virtual-ma': 'Virtuelle MA',
  };
  const getGroupPromptValue = (groupKey) => {
    const prompts = state.groupPrompts && typeof state.groupPrompts === 'object' ? state.groupPrompts : {};
    return sanitizePromptText(prompts[groupKey] !== undefined ? prompts[groupKey] : '', '');
  };
  const getEffectiveAgentPrompt = (def, agent) => {
    const shared = getGroupPromptValue(def.group);
    const individual = sanitizePromptText(agent && agent.prompt !== undefined ? agent.prompt : (def.prompt || ''), def.prompt || '');
    if (shared && individual) return `${shared}\n\n${individual}`;
    return shared || individual || '';
  };
  const getBadgeMeta = (agent) => {
    const mode = normalizeMode(agent && agent.mode);
    const enabled = !!(agent && agent.active);
    const customStatus = normalizeStatusState(agent && agent.statusState);
    if (isAllAgentsPaused()) return { label: 'Pausiert', tone: 'warn' };
    if (!enabled || mode === 'off') return { label: 'Pausiert', tone: 'warn' };
    if (customStatus === 'Fehler') return { label: 'Fehler', tone: 'bad' };
    if (customStatus === 'Gesperrt') return { label: 'Gesperrt', tone: 'bad' };
    if (customStatus === 'Warnung') return { label: 'Warnung', tone: 'warn' };
    if (customStatus === 'Analysiert') return { label: 'Analysiert', tone: 'info' };
    if (customStatus === 'Aktiv') return { label: 'Aktiv', tone: 'good' };
    if (mode === 'auto') return { label: 'Automatisch', tone: 'good' };
    if (mode === 'semi') return { label: 'Aktiv', tone: 'info' };
    return { label: 'Idle', tone: 'info' };
  };
  const getOnlineCount = () => {
    if (isAllAgentsPaused()) return 0;
    return AGENT_DEFS.filter((def) => {
      const agent = getAgent(def.id);
      return agent && agent.active && normalizeMode(agent.mode) !== 'off';
    }).length;
  };
  const getDailyLimitTotal = () => AGENT_DEFS.reduce((sum, def) => {
    const agent = getAgent(def.id);
    if (!agent || !agent.active || normalizeMode(agent.mode) === 'off') return sum;
    return sum + (Number(agent.dailyLimit) || 0);
  }, 0);
  const getUsageTotal = () => AGENT_DEFS.reduce((sum, def) => {
    const agent = getAgent(def.id);
    return sum + (Number(agent && agent.usageToday) || 0);
  }, 0);
  const getUsagePercent = (agent) => {
    const limit = Number(agent && agent.dailyLimit) || 0;
    const usage = Number(agent && agent.usageToday) || 0;
    if (!limit) return 0;
    return Math.max(0, Math.min(100, (usage / limit) * 100));
  };
  const getConnectionItems = (def) => Array.isArray(def && def.connections) ? def.connections : [];
  const AUTONOMY_AREA_NAMES = {
    'ai-task-center': 'AI Task Center',
    'ki-agents': 'KI-Agenten',
    'virtual-ma': 'Virtuelle MA',
    all: 'Alle Bereiche',
  };
  const AGENT_AUTONOMY_LINKS = {
    'soul-scout': { features: ['auto-actions', 'auto-posting'], roles: ['risk-analyst', 'workflow-orchestrator'] },
    'soul-seo': { features: ['auto-posting', 'auto-messages'], roles: ['workflow-orchestrator', 'release-operator'] },
    'soul-guard': { features: ['auto-actions'], roles: ['risk-analyst', 'release-operator'] },
    'soul-finance': { features: ['auto-actions', 'auto-orders'], roles: ['release-operator', 'workflow-orchestrator'] },
    'soul-support': { features: ['auto-messages'], roles: ['support-supervisor', 'workflow-orchestrator'] },
    'soul-operations': { features: ['auto-actions', 'auto-orders', 'auto-messages', 'auto-posting'], roles: ['workflow-orchestrator', 'release-operator'] },
  };
  const getAutonomyItemTitle = (type, id) => {
    const source = type === 'role' ? state.extendedAutonomyRoles : state.extendedAutonomyFeatures;
    const list = Array.isArray(source) ? source : [];
    const item = list.find((entry) => entry.id === id);
    return item ? item.title : id;
  };
  const getAgentAutonomyLinks = (agentId) => {
    const linkDef = AGENT_AUTONOMY_LINKS[agentId] || { features: [], roles: [] };
    return {
      features: linkDef.features.map((id) => getAutonomyItemTitle('feature', id)),
      roles: linkDef.roles.map((id) => getAutonomyItemTitle('role', id)),
    };
  };
  const getAreaAutonomyCounts = (area) => {
    const features = (state.extendedAutonomyFeatures || []).filter((item) => {
      const target = item.config && item.config.targetArea;
      return target === area || target === 'all';
    });
    const roles = (state.extendedAutonomyRoles || []).filter((item) => {
      const target = item.config && item.config.responsibleArea;
      return target === area || target === 'all';
    });
    return { features, roles };
  };
  const getActivityLogItems = (agent, def) => {
    const entries = [
      agent && agent.lastActivity ? agent.lastActivity : DEFAULT_ACTIVITY,
      agent && agent.lastTestResponse ? agent.lastTestResponse : DEFAULT_TEST_RESPONSE,
      isAllAgentsPaused() ? 'System pausiert – alle Agenten warten auf Freigabe.' : 'Wartet auf Aufgabe',
    ];
    return entries.filter((item, index, arr) => item && arr.indexOf(item) === index).slice(0, 3);
  };
  const getTestResponse = (def) => {
    const responses = {
      'soul-scout': 'Test erfolgreich: Soul Scout würde Produktideen, Nachfrage und Potenzial prüfen.',
      'soul-seo': 'Test erfolgreich: Soul SEO würde Titel, Beschreibung und Keywords prüfen.',
      'soul-guard': 'Test erfolgreich: Soul Guard würde Marge, Lieferzeit und Risiko prüfen.',
      'soul-finance': 'Test erfolgreich: Soul Finance würde Gewinn, Gebühren und Break-even prüfen.',
      'soul-support': 'Test erfolgreich: Soul Support würde Kundenantworten und Retouren-Kommunikation vorbereiten.',
      'soul-operations': 'Test erfolgreich: Soul Operations würde Tagesfokus, offene Aufgaben und Warnungen erstellen.',
    };
    return responses[def.id] || 'Test erfolgreich: Lokale Vorschau ohne echte API-Anfrage.';
  };
  const getUsageDelta = (agentId) => {
    const map = {
      'soul-scout': 0.03,
      'soul-seo': 0.04,
      'soul-guard': 0.05,
      'soul-finance': 0.03,
      'soul-support': 0.02,
      'soul-operations': 0.02,
    };
    return map[agentId] || 0.02;
  };
  const buildGlobalStatusBar = () => {
    const onlineCount = getOnlineCount();
    const pausedLabel = isAllAgentsPaused() ? 'pausiert' : 'aktiv';
    const dotClass = isAllAgentsPaused() ? 'paused' : 'active';
    const securityMode = state.securityMode !== false;
    const sandboxMode = state.sandboxMode !== false;
    const autonomyLocked = isAutonomyLocked();
    const masterDisabled = isMasterAgentsDisabled();
    return `
      <div class="virtual-agent-system-bar">
        <div class="virtual-agent-system-top">
          <div>
            <div class="virtual-agent-system-title">
              <span class="virtual-agent-system-dot ${dotClass}"></span>
              <strong>${isAllAgentsPaused() ? 'KI-System pausiert' : 'KI-System aktiv'}</strong>
              <span class="pill">${onlineCount} von ${AGENT_DEFS.length} Agenten online</span>
              <span class="pill">Sicherheitsmodus ${securityMode ? 'aktiv' : 'aus'}</span>
              <span class="pill">Sandbox ${sandboxMode ? 'aktiv' : 'aus'}</span>
              ${masterDisabled ? '<span class="pill bad">Alle Agenten & MA deaktiviert</span>' : ''}
            </div>
            <p class="virtual-agent-system-statusline" style="margin-top:8px">🟢 KI-System ${pausedLabel} - ${onlineCount} von ${AGENT_DEFS.length} Agenten online - Sicherheitsmodus ${securityMode ? 'aktiv' : 'aus'} - Sandbox ${sandboxMode ? 'aktiv' : 'aus'} - Autonomie ${autonomyLocked ? 'gesperrt' : 'frei'}</p>
          </div>
          <div class="virtual-agent-system-actions">
            <button type="button" class="secondary" data-agent-action="pause-all" data-tooltip="${isAllAgentsPaused() ? 'Hebt die globale Pause auf und schaltet alle Agenten wieder an.' : 'Pausiert alle Agenten global und setzt alle Schalter auf Aus.'}">${isAllAgentsPaused() ? 'Alle Agenten fortsetzen' : 'Alle Agenten pausieren'}</button>
            <button type="button" class="danger" data-agent-action="master-toggle-all" data-tooltip="${isMasterAgentsDisabled() ? 'Stellt die vorher gespeicherten Aktiv-Status wieder her.' : 'Deaktiviert alle Agenten und MA komplett und speichert den Zustand.'}">${isMasterAgentsDisabled() ? 'Alle Agenten & MA wiederherstellen' : 'Alle Agenten & MA deaktivieren'}</button>
          </div>
        </div>
        <div class="settings-agents-overview virtual-agent-system-metrics">
          <div class="metric"><small>Agenten online</small><strong>${onlineCount} / ${AGENT_DEFS.length}</strong></div>
          <div class="metric"><small>Sicherheitsmodus</small><strong>${securityMode ? 'Aktiv' : 'Aus'}</strong></div>
          <div class="metric"><small>Sandbox-Modus</small><strong>${sandboxMode ? 'Aktiv' : 'Aus'}</strong></div>
          <div class="metric"><small>Autonomie</small><strong>${autonomyLocked ? 'Gesperrt' : 'Frei'}</strong></div>
          <div class="metric"><small>Geschätztes Tageslimit gesamt</small><strong>${formatEuro(getDailyLimitTotal())}</strong></div>
          <div class="metric"><small>Heutige KI-Nutzung</small><strong>${formatEuro(getUsageTotal())} <span class="hint" style="display:block;margin-top:4px">Mock</span></strong></div>
        </div>
        <div class="virtual-agents-note">${isSecurityLocked() ? 'Sandbox aktiv – Aufgaben werden nur vorbereitet.' : 'Automatische Aktionen werden vorbereitet, aber nicht ohne Bestätigung ausgeführt.'}</div>
      </div>
    `;
  };
  const formatEuro = (value) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(Number(value) || 0);

  const formatTaskDate = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Unbekannt';
    return date.toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
  };

  const getTaskStatCounts = () => {
    const tasks = Array.isArray(state.aiTasks) ? state.aiTasks : [];
    return {
      active: tasks.filter((task) => task.status === 'queued' || task.status === 'running' || task.status === 'waiting_approval').length,
      highPriority: tasks.filter((task) => task.priority === 'high' || task.priority === 'critical').length,
      done: tasks.filter((task) => task.status === 'done').length,
      dismissed: tasks.filter((task) => task.status === 'blocked' || task.status === 'failed').length,
    };
  };

  const getFilteredAiTasks = () => {
    const tasks = Array.isArray(state.aiTasks) ? state.aiTasks : [];
    return tasks.filter((task) => {
      if (taskStatusFilter !== 'all' && task.status !== taskStatusFilter) return false;
      if (taskPriorityFilter !== 'all' && task.priority !== taskPriorityFilter) return false;
      return true;
    }).sort((a, b) => {
      const rankA = AI_TASK_PRIORITY_ORDER[normalizeTaskPriority(a.priority)] || 0;
      const rankB = AI_TASK_PRIORITY_ORDER[normalizeTaskPriority(b.priority)] || 0;
      if (rankA !== rankB) return rankB - rankA;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  };

  const getTriageAiTasks = () => getFilteredAiTasks().filter((task) => {
    const priority = normalizeTaskPriority(task.priority);
    return priority === 'high' || priority === 'critical';
  }).slice(0, 3);

  const getBoardLabel = (task) => {
    if (task.status === 'running') return 'In Bearbeitung';
    if (task.status === 'done') return 'Erledigt';
    if (task.status === 'blocked') return 'Blockiert';
    if (task.status === 'waiting_approval') return 'Wartet auf Freigabe';
    return 'Offen';
  };

  const updateTaskCenterAiTask = (taskId, updater) => {
    const tasks = Array.isArray(state.aiTasks) ? state.aiTasks.slice() : [];
    const index = tasks.findIndex((task) => task && task.id === taskId);
    if (index < 0) return null;
    const current = tasks[index];
    const next = typeof updater === 'function' ? updater(current) : current;
    if (!next || typeof next !== 'object') return null;
    tasks[index] = {
      ...current,
      ...next,
      id: current.id,
      title: sanitizeTaskText(next.title !== undefined ? next.title : current.title, current.title, 120),
      description: sanitizeTaskText(next.description !== undefined ? next.description : current.description, current.description, 260),
      agent: sanitizeTaskText(next.agent !== undefined ? next.agent : current.agent, current.agent, 80),
      category: sanitizeTaskText(next.category !== undefined ? next.category : current.category, current.category, 60),
      priority: normalizeTaskPriority(next.priority !== undefined ? next.priority : current.priority),
      status: normalizeTaskStatus(next.status !== undefined ? next.status : current.status),
      createdAt: current.createdAt,
      source: normalizeTaskSource(next.source !== undefined ? next.source : current.source),
      actionLabel: sanitizeTaskText(next.actionLabel !== undefined ? next.actionLabel : current.actionLabel, current.actionLabel, 40),
    };
    state.aiTasks = tasks;
    saveState();
    render();
    return tasks[index];
  };

  const setTaskStatusFilter = (value) => {
    taskStatusFilter = AI_TASK_STATUS_OPTIONS.some((item) => item.value === value) ? value : 'all';
    render();
  };

  const setTaskPriorityFilter = (value) => {
    taskPriorityFilter = AI_TASK_PRIORITY_OPTIONS.some((item) => item.value === value) ? value : 'all';
    render();
  };

  const setTaskCenterNotice = (value) => {
    taskCenterNotice = sanitizeActivity(value, AI_TASK_NOTICE_DEFAULT);
  };

  const getTaskStatusMeta = (status) => {
    const normalized = normalizeTaskStatus(status);
    const map = {
      queued: 'info',
      running: 'warn',
      done: 'good',
      blocked: 'bad',
      failed: 'bad',
      waiting_approval: 'warn',
    };
    return { label: AI_TASK_STATUS_LABELS[normalized], tone: map[normalized] || 'info' };
  };

  const getTaskPriorityMeta = (priority) => {
    const normalized = normalizeTaskPriority(priority);
    const map = {
      low: 'info',
      normal: 'warn',
      high: 'bad',
      critical: 'bad',
    };
    return { label: AI_TASK_PRIORITY_LABELS[normalized], tone: map[normalized] || 'info' };
  };

  const getTaskSourceMeta = (source) => AI_TASK_SOURCE_LABELS[normalizeTaskSource(source)] || 'Manuell';
  const getTaskPriorityRank = (priority) => AI_TASK_PRIORITY_ORDER[normalizeTaskPriority(priority)] || 0;
  const getTaskById = (taskId) => (Array.isArray(state.aiTasks) ? state.aiTasks.find((task) => task && task.id === taskId) : null);

  const getApprovalQueue = () => (Array.isArray(state.approvalQueue) ? state.approvalQueue : []);
  const getApprovalQueueById = (entryId) => getApprovalQueue().find((entry) => entry && entry.id === entryId) || null;
  const getOrderWorkflowApprovalEntryId = (saleId) => saleId ? `order-workflow-plan-${saleId}` : '';
  const getOrderWorkflowApprovalEntryForSale = (saleId) => {
    const entryId = getOrderWorkflowApprovalEntryId(saleId);
    return entryId ? getApprovalQueueById(entryId) : null;
  };
  const getApprovalTypeLabel = (type) => APPROVAL_QUEUE_TYPE_LABELS[normalizeApprovalQueueType(type)] || 'Listing-Update';
  const getApprovalStatusMeta = (status) => {
    const normalized = normalizeApprovalQueueStatus(status);
    const map = {
      pending: 'info',
      approved: 'good',
      rejected: 'bad',
      executed: 'warn',
    };
    return { label: APPROVAL_QUEUE_STATUS_LABELS[normalized], tone: map[normalized] || 'info' };
  };
  const getApprovalRiskMeta = (riskLevel) => {
    const normalized = normalizeApprovalQueueRisk(riskLevel);
    const map = {
      low: 'info',
      medium: 'warn',
      high: 'bad',
      critical: 'bad',
    };
    return { label: APPROVAL_QUEUE_RISK_LABELS[normalized], tone: map[normalized] || 'info' };
  };
  const getApprovalQueueStats = () => {
    const items = getApprovalQueue();
    return {
      open: items.filter((item) => normalizeApprovalQueueStatus(item.status) === 'pending').length,
      approved: items.filter((item) => normalizeApprovalQueueStatus(item.status) === 'approved').length,
      rejected: items.filter((item) => normalizeApprovalQueueStatus(item.status) === 'rejected').length,
      critical: items.filter((item) => normalizeApprovalQueueRisk(item.riskLevel) === 'critical').length,
    };
  };
  const getApprovalQueueItems = () => getApprovalQueue().slice().sort((a, b) => {
    const statusOrder = { pending: 3, approved: 2, rejected: 1, executed: 0 };
    const riskOrder = { low: 1, medium: 2, high: 3, critical: 4 };
    const statusA = statusOrder[normalizeApprovalQueueStatus(a.status)] || 0;
    const statusB = statusOrder[normalizeApprovalQueueStatus(b.status)] || 0;
    if (statusA !== statusB) return statusB - statusA;
    const riskA = riskOrder[normalizeApprovalQueueRisk(a.riskLevel)] || 0;
    const riskB = riskOrder[normalizeApprovalQueueRisk(b.riskLevel)] || 0;
    if (riskA !== riskB) return riskB - riskA;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
  const formatOrderWorkflowPlanSteps = (plan) => {
    const steps = plan && Array.isArray(plan.steps) ? plan.steps : [];
    return steps.length ? steps.map((step) => step && step.title ? step.title : '').filter(Boolean).join(' · ') : 'Keine Schritte hinterlegt';
  };
  const buildOrderWorkflowPlanCard = (plan) => {
    if (!plan) return '';
    const approvalEntry = getOrderWorkflowApprovalEntryForSale(plan.saleId);
    const stepCount = Number.isFinite(Number(plan.stepCount)) ? Number(plan.stepCount) : (Array.isArray(plan.steps) ? plan.steps.length : 0);
    const statusLabel = plan.status === 'executed' ? 'Bereit zur Ausführung' : (plan.status === 'pending' ? 'In Warteschlange' : 'Vorbereitet');
    const statusTone = plan.status === 'executed' ? 'good' : (plan.status === 'pending' ? 'warn' : 'info');
    const stepItems = Array.isArray(plan.steps) ? plan.steps : [];
    return `
      <article class="virtual-agent-card task-center-card">
        <div class="task-center-card-top">
          <div class="task-center-card-heading">
            <div class="task-center-triage-title">
              <h4>${escapeHtml(plan.orderNo || plan.product || plan.saleId || 'Bestellplan')}</h4>
              <span class="pill">${escapeHtml(plan.workflowMode === 'manual' ? 'Nur Vorbereitung' : 'Halbautomatisch')}</span>
            </div>
            <p>${escapeHtml(formatOrderWorkflowPlanSteps(plan))}</p>
          </div>
          <div class="task-center-badge-stack">
            <span class="virtual-agent-badge ${statusTone}">${escapeHtml(statusLabel)}</span>
            <span class="virtual-agent-badge info">${escapeHtml(plan.platform || 'eBay')}</span>
          </div>
        </div>
        <div class="task-center-meta-grid">
          <div><small>Bestellung</small><strong>${escapeHtml(plan.orderNo || plan.saleId || '-')}</strong></div>
          <div><small>Schritte</small><strong>${escapeHtml(String(stepCount))}</strong></div>
          <div><small>Erstellt</small><strong>${escapeHtml(plan.createdAt ? formatTaskDate(plan.createdAt) : '-')}</strong></div>
          <div><small>Freigabe</small><strong>${approvalEntry ? 'Vorhanden' : 'Noch nicht angelegt'}</strong></div>
        </div>
        <div class="output-box" style="margin-top:12px">
          <p>${escapeHtml(plan.origin ? `Quelle: ${plan.origin}` : 'Quelle: manuell')}</p>
          ${stepItems.length ? `<ul>${stepItems.map((step) => `<li><strong>${escapeHtml(step.title || 'Schritt')}</strong> - ${escapeHtml(step.status || 'prepared')}${step.note ? ` · ${escapeHtml(step.note)}` : ''}</li>`).join('')}</ul>` : '<p>Keine einzelnen Schritte gespeichert.</p>'}
        </div>
        <div class="task-center-control-row">
          <div class="task-center-status-field">
            <label>Live-Blueprint</label>
            <div class="virtual-agent-badge ${statusTone}" style="justify-content:center;width:100%">${escapeHtml(formatLivePipelineText(approvalEntry && approvalEntry.payload && approvalEntry.payload.livePipeline))}</div>
          </div>
          <div class="task-center-action-row">
            ${approvalEntry ? `<button type="button" class="secondary" data-approval-action="details" data-approval-id="${escapeHtml(approvalEntry.id)}">Freigabe ansehen</button>` : ''}
          </div>
        </div>
      </article>
    `;
  };

  const openTaskRemoveModal = (taskId) => {
    const task = getTaskById(taskId);
    if (!task) return;
    taskRemovalTargetId = taskId;
    const modal = getEl('taskRemoveModal');
    const title = getEl('taskRemoveTitle');
    const agent = getEl('taskRemoveAgent');
    const category = getEl('taskRemoveCategory');
    if (title) title.textContent = task.title || '-';
    if (agent) agent.textContent = task.agent || '-';
    if (category) category.textContent = task.category || '-';
    if (modal) {
      modal.classList.remove('hidden');
      modal.setAttribute('aria-hidden', 'false');
    }
  };

  const closeTaskRemoveModal = () => {
    taskRemovalTargetId = '';
    const modal = getEl('taskRemoveModal');
    if (modal) {
      modal.classList.add('hidden');
      modal.setAttribute('aria-hidden', 'true');
    }
  };

  const confirmTaskRemoval = () => {
    if (!taskRemovalTargetId) {
      closeTaskRemoveModal();
      return;
    }
    state.aiTasks = (Array.isArray(state.aiTasks) ? state.aiTasks : []).filter((item) => item && item.id !== taskRemovalTargetId);
    taskRemovalTargetId = '';
    persistAiCollections();
    saveState();
    closeTaskRemoveModal();
    render();
  };

  const createApprovalQueueEntryFromTask = (taskId) => {
    const task = getTaskById(taskId);
    if (!task) return null;
    const label = String(task.actionLabel || task.title || '').toLowerCase();
    const text = [task.title, task.description, task.category, task.agent, task.actionLabel].join(' ').toLowerCase();
    let entry;
    if (text.includes('seo')) {
      entry = {
        title: 'SEO-Optimierung vorbereiten',
        description: 'Ein SEO-Entwurf wird lokal vorbereitet. Es werden keine Live-Änderungen veröffentlicht.',
        agent: task.agent || 'Soul SEO',
        type: 'seo_update',
        riskLevel: 'low',
        previewText: 'Neuer Titelvorschlag: Premium Organizer für Schreibtisch & Büro – kompakt, modern, praktisch',
      };
    } else if (text.includes('support') || text.includes('kunde') || text.includes('retour')) {
      entry = {
        title: 'Supportantwort vorbereiten',
        description: 'Eine Antwortvorlage für eine Kundenanfrage wird vorbereitet. Es wird nichts automatisch versendet.',
        agent: task.agent || 'Soul Support',
        type: 'support_reply',
        riskLevel: 'medium',
        previewText: 'Hallo, danke für deine Nachricht. Ich prüfe den Versandstatus und melde mich zeitnah.',
      };
    } else if (text.includes('order') || text.includes('supplier') || text.includes('bestell')) {
      entry = {
        title: 'Bestellung vorbereiten',
        description: 'Eine Supplier-Bestellung ist vorbereitet. Die Freigabe setzt nur den Status, aber keine Ausführung.',
        agent: task.agent || 'Soul Operations',
        type: 'order_prepare',
        riskLevel: 'high',
        previewText: 'Supplier-Bestellung vorbereitet. Keine Bestellung wurde ausgeführt.',
      };
    } else if (text.includes('risk') || text.includes('liefer') || text.includes('warn') || text.includes('problem')) {
      entry = {
        title: 'Risikobehandlung vorbereiten',
        description: 'Ein risikorelevanter Arbeitsschritt wird lokal vorbereitet. Live-Aktionen bleiben blockiert.',
        agent: task.agent || 'Soul Guard',
        type: 'risk_action',
        riskLevel: 'critical',
        previewText: 'Risikoprüfung vorbereitet. Keine Live-Aktion wurde ausgeführt.',
      };
    } else {
      entry = {
        title: `${task.title || task.actionLabel || 'Aufgabe'} vorbereiten`,
        description: task.description || 'Eine halbautomatische Aktion wird lokal für die Freigabe vorbereitet.',
        agent: task.agent || 'Soul Operations',
        type: 'listing_update',
        riskLevel: 'medium',
        previewText: task.description || 'Entwurf vorbereitet. Keine Live-Aktion ausgeführt.',
      };
    }

    const createdAt = new Date().toISOString();
    const normalized = normalizeApprovalQueueItem({
      id: createApprovalQueueId(),
      ...entry,
      status: 'pending',
      createdAt,
      payload: decorateApprovalPayload(entry.type, {
        source: 'ai-task-center',
        sourceTaskId: task.id,
        sourceActionLabel: task.actionLabel || label || '',
        sourceTaskTitle: task.title || '',
        sourceCategory: task.category || '',
      }, {
        sourceTaskId: task.id,
        taskTitle: task.title || '',
        agent: task.agent || '',
      }),
      requiresConfirmation: true,
    }, getApprovalQueue().length);

    state.approvalQueue = [normalized, ...getApprovalQueue()];
    saveState();
    render();
    return normalized;
  };

  const createTaskCenterSuggestionFromTask = (taskId) => {
    const task = getTaskById(taskId);
    if (!task) return null;
    const tasks = Array.isArray(state.aiTasks) ? state.aiTasks.slice() : [];
    const normalized = normalizeAiTask({
      id: createTaskId(),
      title: `Hinweis: ${task.title || task.actionLabel || 'Aufgabe'}`,
      description: task.description || 'Eine Empfehlung wurde lokal vorbereitet. Es wird keine Live-Aktion ausgeführt.',
      agent: task.agent || 'Soul Operations',
      category: task.category || 'Allgemein',
      priority: normalizeTaskPriority(task.priority || 'normal'),
      status: 'queued',
      createdAt: new Date().toISOString(),
      source: 'agent',
      actionLabel: 'Empfehlung ansehen',
    }, tasks.length);
    state.aiTasks = [normalized, ...tasks];
    persistAiCollections();
    saveState();
    render();
    return normalized;
  };

  const updateApprovalQueueEntry = (entryId, updater) => {
    const items = getApprovalQueue().slice();
    const index = items.findIndex((item) => item && item.id === entryId);
    if (index < 0) return null;
    const current = items[index];
    const next = typeof updater === 'function' ? updater(current) : current;
    if (!next || typeof next !== 'object') return null;
    items[index] = {
      ...current,
      ...next,
      id: current.id,
      title: sanitizeTaskText(next.title !== undefined ? next.title : current.title, current.title, 120),
      description: sanitizeTaskText(next.description !== undefined ? next.description : current.description, current.description, 260),
      agent: sanitizeTaskText(next.agent !== undefined ? next.agent : current.agent, current.agent, 80),
      type: normalizeApprovalQueueType(next.type !== undefined ? next.type : current.type),
      status: normalizeApprovalQueueStatus(next.status !== undefined ? next.status : current.status),
      riskLevel: normalizeApprovalQueueRisk(next.riskLevel !== undefined ? next.riskLevel : current.riskLevel),
      createdAt: current.createdAt,
      payload: next.payload && typeof next.payload === 'object' && !Array.isArray(next.payload) ? { ...next.payload } : { ...(current.payload || {}) },
      previewText: sanitizeTaskText(next.previewText !== undefined ? next.previewText : current.previewText, current.previewText, 320),
      requiresConfirmation: true,
    };
    state.approvalQueue = items;
    saveState();
    render();
    return items[index];
  };

  const openApprovalDetailsModal = (entryId) => {
    const entry = getApprovalQueueById(entryId);
    if (!entry) return;
    approvalDetailTargetId = entryId;
    const modal = getEl('approvalQueueDetailModal');
    const title = getEl('approvalDetailTitle');
    const agent = getEl('approvalDetailAgent');
    const type = getEl('approvalDetailType');
    const status = getEl('approvalDetailStatus');
    const risk = getEl('approvalDetailRisk');
    const createdAt = getEl('approvalDetailCreatedAt');
    const description = getEl('approvalDetailDescription');
    const preview = getEl('approvalDetailPreview');
    const orderPlanSummary = getEl('approvalDetailOrderPlanSummary');
    const orderPlanSteps = getEl('approvalDetailOrderPlanSteps');
    const payload = getEl('approvalDetailPayload');
    const pipeline = getEl('approvalDetailPipeline');
    if (title) title.textContent = entry.title || '-';
    if (agent) agent.textContent = entry.agent || '-';
    if (type) type.textContent = getApprovalTypeLabel(entry.type);
    if (status) status.textContent = getApprovalStatusMeta(entry.status).label;
    if (risk) risk.textContent = getApprovalRiskMeta(entry.riskLevel).label;
    if (createdAt) createdAt.textContent = formatTaskDate(entry.createdAt);
    if (description) description.textContent = entry.description || 'Keine Beschreibung vorhanden.';
    if (preview) preview.textContent = entry.previewText || 'Keine Vorschau vorhanden.';
    const orderPlan = entry.payload && entry.payload.orderWorkflowPlan ? entry.payload.orderWorkflowPlan : null;
    if (orderPlanSummary) {
      orderPlanSummary.textContent = orderPlan
        ? `${orderPlan.orderNo || orderPlan.product || orderPlan.saleId || 'Bestellung'} · ${formatOrderWorkflowPlanSteps(orderPlan)}`
        : 'Kein Bestellplan hinterlegt.';
    }
    if (orderPlanSteps) {
      orderPlanSteps.innerHTML = orderPlan && Array.isArray(orderPlan.steps) && orderPlan.steps.length
        ? orderPlan.steps.map((step) => `<li><strong>${escapeHtml(step.title || 'Schritt')}</strong> - ${escapeHtml(step.status || 'prepared')}${step.note ? ` · ${escapeHtml(step.note)}` : ''}</li>`).join('')
        : '<li>Keine einzelnen Schritte hinterlegt.</li>';
    }
    if (payload) payload.textContent = JSON.stringify(entry.payload || {}, null, 2);
    if (pipeline) pipeline.textContent = formatLivePipelineText(resolveApprovalLivePipeline(entry));
    if (modal) {
      modal.classList.remove('hidden');
      modal.setAttribute('aria-hidden', 'false');
    }
  };

  const closeApprovalDetailsModal = () => {
    approvalDetailTargetId = '';
    const modal = getEl('approvalQueueDetailModal');
    if (modal) {
      modal.classList.add('hidden');
      modal.setAttribute('aria-hidden', 'true');
    }
  };

  const closeToolPopup = () => {
    if (toolPopupCloseTimeout) {
      window.clearTimeout(toolPopupCloseTimeout);
      toolPopupCloseTimeout = null;
    }
    const modal = getEl('toolPopupModal');
    if (modal) {
      modal.classList.add('hidden');
      modal.setAttribute('aria-hidden', 'true');
    }
  };

  const showToolPopup = (title, message, tone) => {
    const modal = getEl('toolPopupModal');
    const popupTitle = getEl('toolPopupTitle');
    const popupSubtitle = getEl('toolPopupSubtitle');
    const popupMessage = getEl('toolPopupMessage');
    if (!modal || !popupTitle || !popupSubtitle || !popupMessage) return;
    const badge = modal.querySelector('.virtual-agent-badge');
    closeToolPopup();
    popupTitle.textContent = title || 'Bestätigung';
    popupSubtitle.textContent = 'Elyon Tool Rückmeldung';
    popupMessage.textContent = message || '';
    if (badge) {
      const toneClass = tone === 'warn' ? 'warn' : tone === 'bad' ? 'bad' : 'good';
      badge.className = `virtual-agent-badge ${toneClass}`;
      badge.textContent = toneClass === 'warn' ? 'Hinweis' : toneClass === 'bad' ? 'Achtung' : 'Übernommen';
    }
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    toolPopupCloseTimeout = window.setTimeout(() => {
      closeToolPopup();
    }, 4500);
  };
  const formatConnectorDraftText = (result) => {
    if (!result || !result.draft || typeof result.draft !== 'object') return '';
    const draft = result.draft;
    if (draft.recipient || draft.subject || draft.body) {
      return `\nEmpfänger: ${draft.recipient || '-'}\nBetreff: ${draft.subject || '-'}\nText: ${draft.body || '-'}`;
    }
    if (draft.title || (Array.isArray(draft.keywords) && draft.keywords.length) || draft.description) {
      const keywordText = Array.isArray(draft.keywords) && draft.keywords.length ? draft.keywords.join(', ') : '-';
      const titleText = draft.title || '-';
      const descText = draft.description || '-';
      return `\nTitel: ${titleText}\nKeywords: ${keywordText}\nBeschreibung: ${descText}`;
    }
    return '';
  };

  const handleApprovalAction = async (entryId, action) => {
    if (!entryId) return;
    const entry = getApprovalQueueById(entryId);
    if (action === 'approve') {
      updateApprovalQueueEntry(entryId, (entry) => ({ ...entry, status: 'approved' }));
      if (entry) {
        const executionResult = await executeLiveAction({ ...entry, status: 'approved' });
        if (executionResult && executionResult.ok && executionResult.status === 'executed') {
          updateApprovalQueueEntry(entryId, (current) => ({ ...current, status: 'executed' }));
        }
        const connectorDraft = formatConnectorDraftText(executionResult);
        showToolPopup(
          'Freigabe vorbereitet',
          `${executionResult && executionResult.message ? executionResult.message : formatLivePipelineText(entry.payload && entry.payload.livePipeline)}${connectorDraft}`,
          executionResult && executionResult.status === 'blocked' ? 'bad' : 'warn'
        );
      }
      return;
    }
    if (action === 'reject') {
      updateApprovalQueueEntry(entryId, (entry) => ({ ...entry, status: 'rejected' }));
      if (entry) {
        showToolPopup('Freigabe abgelehnt', formatLivePipelineText(entry.payload && entry.payload.livePipeline), 'warn');
      }
      return;
    }
    if (action === 'details') {
      openApprovalDetailsModal(entryId);
    }
  };

  const handleTaskAction = (taskId, action) => {
    if (!taskId) return;
    if (action === 'done') {
      updateTaskCenterAiTask(taskId, (task) => ({ ...task, status: 'done' }));
      return;
    }
    if (action === 'dismiss') {
      updateTaskCenterAiTask(taskId, (task) => ({ ...task, status: 'blocked' }));
      return;
    }
    if (action === 'remove') {
      openTaskRemoveModal(taskId);
      return;
    }
    if (action === 'run') {
      runAiTask(taskId);
      return;
    }
    if (action === 'queued' || action === 'running' || action === 'blocked' || action === 'done' || action === 'failed' || action === 'waiting_approval') {
      updateTaskCenterAiTask(taskId, (task) => ({ ...task, status: action }));
      return;
    }
    if (action === 'prepare') {
      setTaskCenterNotice(isSecurityLocked() ? AI_TASK_NOTICE_SANDBOX : AI_TASK_NOTICE_DEFAULT);
      render();
    }
  };

  const buildTaskFilterButton = (group, value, label, activeValue) => `
    <button
      type="button"
      class="${group === 'status' ? 'task-center-filter-btn' : 'task-center-filter-chip'} ${activeValue === value ? 'active' : ''}"
      data-task-filter-group="${group}"
      data-task-filter-value="${value}"
    >${escapeHtml(label)}</button>
  `;

  const buildTaskCard = (task) => {
    const priorityMeta = getTaskPriorityMeta(task.priority);
    const statusMeta = getTaskStatusMeta(task.status);
    const createdAt = formatTaskDate(task.createdAt);
    return `
      <article class="virtual-agent-card task-center-card task-center-priority-${escapeHtml(normalizeTaskPriority(task.priority))}">
        <div class="task-center-card-top">
          <div class="task-center-card-heading">
            <div class="task-center-triage-title">
              <h4>${escapeHtml(task.title)}</h4>
              <span class="pill">${escapeHtml(getBoardLabel(task))}</span>
            </div>
            <p>${escapeHtml(task.description)}</p>
          </div>
          <div class="task-center-badge-stack">
            <span class="virtual-agent-badge ${priorityMeta.tone}">${escapeHtml(priorityMeta.label)}</span>
            <span class="virtual-agent-badge ${statusMeta.tone}">${escapeHtml(statusMeta.label)}</span>
          </div>
        </div>

        <div class="task-center-meta-grid">
          <div><small>Agent</small><strong>${escapeHtml(task.agent)}</strong></div>
          <div><small>Kategorie</small><strong>${escapeHtml(task.category)}</strong></div>
          <div><small>Erstellt</small><strong>${escapeHtml(createdAt)}</strong></div>
          <div><small>Quelle</small><strong>${escapeHtml(getTaskSourceMeta(task.source))}</strong></div>
        </div>

        <div class="task-center-control-row">
          <div class="task-center-status-field">
            <label>Status ändern</label>
            <select data-task-id="${escapeHtml(task.id)}" data-task-field="status">
              ${AI_TASK_STATUS_OPTIONS.filter((item) => item.value !== 'all').map((item) => `<option value="${item.value}" ${task.status === item.value ? 'selected' : ''}>${item.label}</option>`).join('')}
            </select>
          </div>
          <div class="task-center-action-row">
            <button type="button" class="secondary" data-task-action="prepare" data-task-id="${escapeHtml(task.id)}">${escapeHtml(task.actionLabel)}</button>
            <button type="button" class="secondary" data-task-action="run" data-task-id="${escapeHtml(task.id)}">Ausführen</button>
            <button type="button" class="secondary" data-task-action="done" data-task-id="${escapeHtml(task.id)}">Erledigt</button>
            <button type="button" class="secondary" data-task-action="dismiss" data-task-id="${escapeHtml(task.id)}">Ausblenden</button>
            <button type="button" class="secondary" data-task-action="remove" data-task-id="${escapeHtml(task.id)}">Entfernen</button>
          </div>
        </div>
      </article>
    `;
  };

  const buildTaskCenterPanel = () => {
    const stats = getTaskStatCounts();
    const hasSandboxHint = isSecurityLocked();
    const pauseHint = isAllAgentsPaused();
    const tasks = getFilteredAiTasks();
    const triageTasks = getTriageAiTasks();
    const totalTasks = Array.isArray(state.aiTasks) ? state.aiTasks.length : 0;
    const selectedTask = tasks[0] || null;
    const emptyMessage = totalTasks
      ? 'Keine KI-Aufgaben passen zu den aktiven Filtern.'
      : 'Keine KI-Aufgaben vorhanden. Sobald Agenten aktiv werden, erscheinen hier Empfehlungen und Warnungen.';
    return `
      <div class="virtual-agent-card virtual-agents-panel ${activePanel === 'ai-task-center' ? 'active' : ''}" data-panel="ai-task-center">
        <div class="task-center-shell">
          <div class="task-center-head">
            <div class="virtual-agent-ident">
              <div class="virtual-agent-icon">📌</div>
              <div>
                <h3>AI Task Center</h3>
                <p>Aufgaben, Warnungen und Empfehlungen deiner virtuellen Mitarbeiter.</p>
              </div>
            </div>
            <span class="virtual-agent-badge info">Lokale Task-Queue</span>
          </div>
          <div class="settings-agents-overview task-center-stats">
            <div class="metric"><small>Offene Aufgaben</small><strong>${stats.active}</strong></div>
            <div class="metric"><small>Hohe Priorität</small><strong>${stats.highPriority}</strong></div>
            <div class="metric"><small>Erledigt</small><strong>${stats.done}</strong></div>
            <div class="metric"><small>Pausiert / ausgeblendet</small><strong>${stats.dismissed}</strong></div>
          </div>

          ${pauseHint ? '<div class="task-center-alert">Alle Agenten sind pausiert. Es werden keine neuen Aufgaben erzeugt.</div>' : ''}
          ${hasSandboxHint ? `<div class="task-center-alert task-center-alert-warn">${AI_TASK_NOTICE_SANDBOX}</div>` : ''}
          <div class="task-center-alert">${AI_TASK_LIVE_HINT}</div>
          ${taskCenterNotice ? `<div class="output-box task-center-notice"><p>${escapeHtml(taskCenterNotice)}</p></div>` : ''}

          <section class="settings-section" style="margin-top:14px;padding:16px;border-radius:18px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08)">
            <h4 style="margin-bottom:8px">Neue Aufgabe</h4>
            <div class="row">
              <div style="flex:1;min-width:180px">
                <label>Titel</label>
                <input id="aiTaskTitleInput" type="text" placeholder="Produktanalyse">
              </div>
              <div style="flex:2;min-width:240px">
                <label>Beschreibung</label>
                <input id="aiTaskDescriptionInput" type="text" placeholder="Was soll geprüft werden?">
              </div>
            </div>
            <div class="row" style="margin-top:10px">
              <div style="flex:1;min-width:180px">
                <label>Agent</label>
                <select id="aiTaskAgentSelect">
                  <option value="">Ohne Agent</option>
                  ${Object.keys(state.agents || {}).map((agentId) => `<option value="${escapeHtml(agentId)}">${escapeHtml(getAgent(agentId)?.name || agentId)}</option>`).join('')}
                </select>
              </div>
              <div style="flex:1;min-width:180px">
                <label>Typ</label>
                <select id="aiTaskTypeSelect">
                  ${AI_TASK_TYPES.map((item) => `<option value="${escapeHtml(item.value)}">${escapeHtml(item.label)}</option>`).join('')}
                </select>
              </div>
              <div style="flex:1;min-width:180px">
                <label>Priorität</label>
                <select id="aiTaskPrioritySelect">
                  ${AI_TASK_PRIORITIES.map((item) => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join('')}
                </select>
              </div>
              <div style="display:flex;align-items:end">
                <button type="button" class="secondary" data-task-action="create-task">Aufgabe erstellen</button>
              </div>
            </div>
          </section>

          <section class="task-center-triage">
            <div class="task-center-triage-head">
              <div>
                <h4>Wichtige Aufgaben</h4>
                <p>Kritische und hohe Aufgaben erscheinen hier zuerst. So sieht das Team die dringendsten Hinweise sofort.</p>
              </div>
              <span class="virtual-agent-badge warn">${triageTasks.length} Prioritäts-Tasks</span>
            </div>
            ${triageTasks.length ? `
              <div class="task-center-triage-list">
                ${triageTasks.map((task) => {
                  const priorityMeta = getTaskPriorityMeta(task.priority);
                  return `
                    <article class="task-center-triage-item" data-task-priority="${escapeHtml(normalizeTaskPriority(task.priority))}">
                      <div class="task-center-triage-title">
                        <strong>${escapeHtml(task.title)}</strong>
                        <span>${escapeHtml(task.agent)} · ${escapeHtml(priorityMeta.label)}</span>
                      </div>
                      <p>${escapeHtml(task.description)}</p>
                      <div class="task-center-triage-actions">
                        <button type="button" class="secondary" data-task-action="prepare" data-task-id="${escapeHtml(task.id)}">${escapeHtml(task.actionLabel)}</button>
                        <button type="button" class="secondary" data-task-action="done" data-task-id="${escapeHtml(task.id)}">Erledigt</button>
                        <button type="button" class="secondary" data-task-action="dismiss" data-task-id="${escapeHtml(task.id)}">Ausblenden</button>
                        <button type="button" class="secondary" data-task-action="remove" data-task-id="${escapeHtml(task.id)}">Entfernen</button>
                      </div>
                    </article>
                  `;
                }).join('')}
              </div>
            ` : '<div class="task-center-triage-empty">Keine hohen oder kritischen Aufgaben offen. Die Triage ist aktuell ruhig.</div>'}
          </section>

          <div class="task-center-filters">
            <div>
              <label>Status filtern</label>
              <div class="task-center-filter-group">
                ${AI_TASK_STATUS_OPTIONS.map((option) => buildTaskFilterButton('status', option.value, option.label, taskStatusFilter)).join('')}
              </div>
            </div>
            <div>
              <label>Priorität filtern</label>
              <div class="task-center-filter-group">
                ${AI_TASK_PRIORITY_OPTIONS.map((option) => buildTaskFilterButton('priority', option.value, option.label, taskPriorityFilter)).join('')}
              </div>
            </div>
          </div>

          <div class="task-center-list">
            ${tasks.length ? tasks.map((task) => buildTaskCard(task)).join('') : `<div class="empty task-center-empty">${escapeHtml(emptyMessage)}</div>`}
          </div>

          <div class="task-center-card output-box" style="margin-top:14px">
            <h4>Aufgabendetails</h4>
            ${selectedTask ? `
              <p><strong>${escapeHtml(selectedTask.title)}</strong> · ${escapeHtml(selectedTask.type)} · ${escapeHtml(selectedTask.status)}</p>
              <p>${escapeHtml(selectedTask.description)}</p>
              <p><strong>Ergebnis:</strong> ${escapeHtml(selectedTask.result || 'Noch kein Ergebnis')}</p>
              <p><strong>Fehler:</strong> ${escapeHtml(selectedTask.error || 'Kein Fehler')}</p>
              <div class="hint" style="margin-top:8px"><strong>Prompt:</strong><br>${escapeHtml(buildEffectiveAgentPrompt(selectedTask.agentId, selectedTask)).replace(/\n/g, '<br>')}</div>
              <div class="output-box" style="margin-top:10px">
                <h4>Logs</h4>
                ${(Array.isArray(selectedTask.logs) && selectedTask.logs.length ? selectedTask.logs : ['Noch keine Logs']).map((item) => `<p>${escapeHtml(typeof item === 'string' ? item : JSON.stringify(item))}</p>`).join('')}
              </div>
            ` : '<p>Noch keine Aufgabe ausgewählt.</p>'}
          </div>
        </div>
      </div>
    `;
  };

  const buildApprovalQueueCard = (entry) => {
    const riskMeta = getApprovalRiskMeta(entry.riskLevel);
    const statusMeta = getApprovalStatusMeta(entry.status);
    const createdAt = formatTaskDate(entry.createdAt);
    const orderPlan = entry && entry.payload && entry.payload.orderWorkflowPlan ? entry.payload.orderWorkflowPlan : null;
    const orderPlanSteps = orderPlan && Array.isArray(orderPlan.steps) ? orderPlan.steps : [];
    return `
      <article class="virtual-agent-card task-center-card approval-queue-card approval-queue-risk-${escapeHtml(normalizeApprovalQueueRisk(entry.riskLevel))}">
        <div class="task-center-card-top">
          <div class="task-center-card-heading">
            <div class="task-center-triage-title">
              <h4>${escapeHtml(entry.title)}</h4>
              <span class="pill">${entry.requiresConfirmation ? 'Bestätigung nötig' : 'Keine Bestätigung'}</span>
            </div>
            <p>${escapeHtml(entry.description)}</p>
          </div>
          <div class="task-center-badge-stack">
            <span class="virtual-agent-badge ${riskMeta.tone}">${escapeHtml(riskMeta.label)}</span>
            <span class="virtual-agent-badge ${statusMeta.tone}">${escapeHtml(statusMeta.label)}</span>
          </div>
        </div>

        <div class="task-center-meta-grid">
          <div><small>Agent</small><strong>${escapeHtml(entry.agent)}</strong></div>
          <div><small>Typ</small><strong>${escapeHtml(getApprovalTypeLabel(entry.type))}</strong></div>
          <div><small>Erstellt</small><strong>${escapeHtml(createdAt)}</strong></div>
          <div><small>Bestätigung</small><strong>${entry.requiresConfirmation ? 'Erforderlich' : 'Nicht nötig'}</strong></div>
        </div>

        ${orderPlan ? `
          <div class="output-box" style="margin-top:12px">
            <h4>Bestellplan</h4>
            <p>${escapeHtml(orderPlan.orderNo || orderPlan.product || orderPlan.saleId || 'Bestellung')} · ${escapeHtml(String(orderPlanSteps.length || orderPlan.stepCount || 0))} vorbereitete Schritte</p>
            <p>${escapeHtml(formatOrderWorkflowPlanSteps(orderPlan))}</p>
          </div>
        ` : ''}

        <div class="output-box" style="margin-top:12px">
          <p>${escapeHtml(entry.previewText || 'Keine Vorschau vorhanden.')}</p>
        </div>

        <div class="task-center-control-row">
          <div class="task-center-status-field">
            <label>Risiko</label>
            <div class="virtual-agent-badge ${riskMeta.tone}" style="justify-content:center;width:100%">${escapeHtml(riskMeta.label)}</div>
          </div>
          <div class="task-center-action-row">
          <button type="button" class="secondary" data-approval-action="approve" data-approval-id="${escapeHtml(entry.id)}">Genehmigen</button>
          <button type="button" class="secondary" data-approval-action="reject" data-approval-id="${escapeHtml(entry.id)}">Ablehnen</button>
          <button type="button" class="secondary" data-approval-action="details" data-approval-id="${escapeHtml(entry.id)}">Details ansehen</button>
        </div>
      </div>
      </article>
    `;
  };

  const buildApprovalQueuePanel = () => {
    const stats = getApprovalQueueStats();
    const hasSandboxHint = isSecurityLocked();
    const items = getApprovalQueueItems();
    const totalItems = getApprovalQueue().length;
    const emptyMessage = totalItems
      ? 'Keine Freigabe-Einträge passen zu den aktuellen Filtern.'
      : 'Noch keine Einträge vorhanden. Sobald ein Agent eine halbautomatische Aktion vorbereitet, erscheint sie hier.';
    return `
      <div class="virtual-agent-card virtual-agents-panel ${activePanel === 'approval-queue' ? 'active' : ''}" data-panel="approval-queue">
        <div class="task-center-shell">
          <div class="task-center-head">
            <div class="virtual-agent-ident">
              <div class="virtual-agent-icon">✅</div>
              <div>
                <h3>Freigabe-Warteschlange</h3>
                <p>Halbautomatische Aktionen, die deine Bestätigung benötigen.</p>
              </div>
            </div>
            <span class="virtual-agent-badge info">Manuelle Freigabe</span>
          </div>

          <div class="settings-agents-overview task-center-stats">
            <div class="metric"><small>Offen</small><strong>${stats.open}</strong></div>
            <div class="metric"><small>Genehmigt</small><strong>${stats.approved}</strong></div>
            <div class="metric"><small>Abgelehnt</small><strong>${stats.rejected}</strong></div>
            <div class="metric"><small>Kritisch</small><strong>${stats.critical}</strong></div>
          </div>

          ${hasSandboxHint ? '<div class="task-center-alert task-center-alert-warn">Sandbox aktiv – Genehmigung wird nur simuliert.</div>' : '<div class="task-center-alert">Genehmigung setzt nur den Status auf approved. Keine Live-Aktion wird ausgeführt.</div>'}
          <div class="task-center-alert">Auch im halbautomatischen Modus werden keine echten Bestellungen, Nachrichten oder eBay-Listings ausgelöst.</div>

          <div class="task-center-list">
            ${items.length ? items.map((entry) => buildApprovalQueueCard(entry)).join('') : `<div class="empty task-center-empty">${escapeHtml(emptyMessage)}</div>`}
          </div>
        </div>
      </div>
    `;
  };

  const buildOverviewPanel = () => {
    return `
      <div class="virtual-agent-card virtual-agents-panel ${activePanel === 'overview' ? 'active' : ''}" data-panel="overview">
        <div class="virtual-agent-head">
          <div class="virtual-agent-ident">
            <div class="virtual-agent-icon">🧭</div>
            <div>
              <h3>Sicherheits- & Steuerzentrale</h3>
              <p>Hier werden Sicherheitsrahmen und Autonomiegrenzen für die virtuellen Mitarbeiter verwaltet. Live-Aktionen bleiben blockiert, solange Sicherheitsmodus oder Sandbox aktiv ist.</p>
            </div>
          </div>
          <span class="virtual-agent-badge info">Lokale Orchestrierung</span>
        </div>
        <div class="security-switch-row" style="margin-top:14px">
          <div>
            <strong>Sicherheitsmodus</strong>
            <p class="hint">Automatische Aktionen bleiben bestätigtspflichtig. Sandbox und Autonomie bleiben lokal abgesichert.</p>
          </div>
          <label class="agent-switch" style="margin:0">
            <input type="checkbox" data-agent-field="safetyMode" ${state.safetyMode !== false ? 'checked' : ''}>
            <span class="agent-switch-track"></span>
            <span>Sicherheitsmodus</span>
          </label>
        </div>
        <div class="virtual-agents-note" style="margin-top:14px">${isSecurityLocked() ? 'Sandbox aktiv – Aufgaben werden nur vorbereitet.' : 'Automatische Aktionen werden vorbereitet, aber nicht ohne Bestätigung ausgeführt.'}</div>
        <div class="extended-autonomy-card ${state.advancedMode === true && state.autonomyLocked === false ? 'active' : ''}" style="margin-top:14px">
          <div class="extended-autonomy-head">
            <div class="virtual-agent-ident" style="align-items:flex-start">
              <div class="virtual-agent-icon">${state.advancedMode === true && state.autonomyLocked === false ? '🟡' : '🔒'}</div>
              <div>
                <h4>${state.advancedMode === true && state.autonomyLocked === false ? 'Erweiterte Autonomie aktiv' : 'Erweiterte Autonomie gesperrt'}</h4>
                <p>${state.advancedMode === true && state.autonomyLocked === false ? 'Sandbox-Modus weiterhin aktiv' : 'Erweiterte Zukunftsfunktionen bleiben sicher blockiert und werden nur vorbereitet.'}</p>
              </div>
            </div>
            <span class="virtual-agent-badge ${state.advancedMode === true && state.autonomyLocked === false ? 'warn' : 'info'}">${state.advancedMode === true && state.autonomyLocked === false ? 'Experimentell' : 'Geschützt'}</span>
          </div>
          <div class="extended-autonomy-copy">
            ${state.advancedMode === true && state.autonomyLocked === false ? 'Live-Aktionen bleiben weiterhin blockiert, solange Sicherheitsmodus oder Sandbox aktiv sind.' : 'Erst nach einer manuellen Freigabe werden experimentelle Autonomie-Optionen sichtbar vorbereitet. Live-Aktionen bleiben dabei gesperrt.'}
          </div>
          <div class="extended-autonomy-status">
            <span class="pill">Sicherheitsmodus ${state.securityMode !== false ? 'aktiv' : 'aus'}</span>
            <span class="pill">Sandbox-Modus ${state.sandboxMode !== false ? 'aktiv' : 'aus'}</span>
            <span class="pill">Autonomie ${state.autonomyLocked === false ? 'frei' : 'gesperrt'}</span>
            <span class="pill">Erweiterte Autonomie ${state.advancedMode === true && state.autonomyLocked === false ? 'aktiv' : 'gesperrt'}</span>
          </div>
          <div class="extended-autonomy-note">
            ${state.advancedMode === true && state.autonomyLocked === false ? 'Live-Aktionen bleiben weiterhin blockiert, solange Sicherheitsmodus oder Sandbox aktiv sind.' : 'Diese Freischaltung dient nur dazu, Zukunftsfunktionen vorbereitet sichtbar zu machen. Keine echten Live-Aktionen werden ausgelöst.'}
          </div>
          <div class="extended-autonomy-actions">
            ${state.advancedMode === true && state.autonomyLocked === false ? '<button type="button" class="secondary" data-agent-action="lock-advanced-autonomy">Erweiterte Autonomie sperren</button>' : '<button type="button" class="secondary" data-agent-action="open-advanced-autonomy">Erweiterte Autonomie freischalten</button>'}
          </div>
        </div>
        <div class="virtual-agent-footer">
          <button type="button" class="secondary" data-agent-action="reset-all">Alle Agenten auf Standardwerte zurücksetzen</button>
        </div>
      </div>
    `;
  };

  const buildOrderWorkflowPanel = () => {
    const workflow = getOrderWorkflowSettings();
    const openSales = getOpenWorkflowSales().slice(0, 5);
    const preparedPlans = Array.isArray(workflow.preparedPlans) ? workflow.preparedPlans : [];
    const workflowModeLabel = orderWorkflowModeLabel(workflow.mode);
    return `
      <div class="virtual-agent-card virtual-agents-panel ${activePanel === 'order-workflow' ? 'active' : ''}" data-panel="order-workflow">
        <div class="virtual-agent-head">
          <div class="virtual-agent-ident">
            <div class="virtual-agent-icon">📦</div>
            <div>
              <h3>Bestellworkflow</h3>
              <p>Hier speicherst du, wie neue Bestellungen halbautomatisch vorbereitet werden sollen.</p>
            </div>
          </div>
          <span class="virtual-agent-badge info">${workflow.enabled ? workflowModeLabel : 'Deaktiviert'}</span>
        </div>

        <div class="settings-agents-overview" style="margin-top:14px">
          <div class="metric"><small>Status</small><strong>${workflow.enabled ? 'Aktiv' : 'Aus'}</strong></div>
          <div class="metric"><small>Modus</small><strong>${workflowModeLabel}</strong></div>
          <div class="metric"><small>Letzter Lauf</small><strong>${workflow.lastRunAt ? escapeHtml(formatTaskDate(workflow.lastRunAt)) : 'Noch nie'}</strong></div>
          <div class="metric"><small>Offene Bestellungen</small><strong>${openSales.length}</strong></div>
          <div class="metric"><small>Vorbereitete Pläne</small><strong>${preparedPlans.length}</strong></div>
        </div>

        <div class="virtual-agents-note" style="margin-top:14px">
          Der Workflow bleibt lokal gespeichert. Er legt keine echte Bestellung oder Rechnung an, sondern bereitet die nächsten Schritte für die Freigabe vor.
        </div>

        <div class="virtual-agent-grid" style="margin-top:14px">
          <label class="agent-switch">
            <input type="checkbox" data-order-workflow-field="enabled" ${workflow.enabled ? 'checked' : ''}>
            <span class="agent-switch-track"></span>
            <span>Workflow aktivieren</span>
          </label>

          <div>
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
              <label style="margin:0">Ausführungsmodus</label>
              <span title="Halbautomatisch legt vorbereitete Schritte in die Freigabe-Warteschlange. Nur Vorbereitung speichert den Ablauf ohne Freigabe-Einträge." style="display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:999px;border:1px solid rgba(191,219,254,.35);color:#bfdbfe;font-size:11px;cursor:help;background:rgba(59,130,246,.12)">i</span>
            </div>
            <select data-order-workflow-field="mode">
              <option value="semi" ${workflow.mode === 'semi' ? 'selected' : ''}>Halbautomatisch</option>
              <option value="manual" ${workflow.mode === 'manual' ? 'selected' : ''}>Nur Vorbereitung</option>
            </select>
          </div>

          <label class="agent-switch">
            <input type="checkbox" data-order-workflow-field="autoInvoice" ${workflow.autoInvoice ? 'checked' : ''}>
            <span class="agent-switch-track"></span>
            <span>Rechnung vorbereiten</span>
          </label>

          <label class="agent-switch">
            <input type="checkbox" data-order-workflow-field="autoShippingTask" ${workflow.autoShippingTask ? 'checked' : ''}>
            <span class="agent-switch-track"></span>
            <span>Versand vorbereiten</span>
          </label>

          <label class="agent-switch">
            <input type="checkbox" data-order-workflow-field="autoQueueReview" ${workflow.autoQueueReview ? 'checked' : ''}>
            <span class="agent-switch-track"></span>
            <span>Prüfung anstoßen</span>
          </label>

          <label class="agent-switch">
            <input type="checkbox" data-order-workflow-field="autoSyncGoogleSheets" ${workflow.autoSyncGoogleSheets ? 'checked' : ''}>
            <span class="agent-switch-track"></span>
            <span>Google Sheets vorbereiten</span>
          </label>

          <div style="grid-column:1 / -1">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px">
              <label style="margin:0">Workflow-Notiz</label>
              <button type="button" class="secondary" data-order-workflow-action="toggle-note-lock" title="${workflow.noteLocked !== false ? 'Textfeld freischalten' : 'Textfeld sperren'}" style="padding:4px 8px;min-height:auto;line-height:1;font-size:12px">
                ${workflow.noteLocked !== false ? '✏️ Freischalten' : '🔒 Sperren'}
              </button>
            </div>
            <div style="display:flex;justify-content:flex-end;margin:-4px 0 8px 0;font-size:12px;color:${workflow.noteLocked !== false ? '#fda4af' : '#86efac'}">
              ${workflow.noteLocked !== false ? 'Status: Gesperrt' : 'Status: Freigeschaltet'}
            </div>
            <textarea data-order-workflow-field="note" ${workflow.noteLocked !== false ? 'readonly aria-readonly="true"' : ''} placeholder="z. B. erst Rechnung, dann Versand, dann Sync" style="${workflow.noteLocked !== false ? 'opacity:.72;cursor:not-allowed;' : ''}">${escapeHtml(workflow.note || '')}</textarea>
          </div>
        </div>

        <div class="row" style="margin-top:14px">
          <button type="button" class="secondary full" data-order-workflow-action="save">Workflow speichern</button>
          <button type="button" class="secondary full" data-order-workflow-action="apply-open">Offene Bestellungen vorbereiten</button>
        </div>

        <div class="output-box" style="margin-top:14px">
          <h3>Nächste vorbereitete Schritte</h3>
          <p>${workflow.enabled ? `Neue Bestellungen werden nach dem Speichern in diesen Ablauf eingespeist. Modus: ${workflowModeLabel}.` : 'Workflow ist noch deaktiviert. Erst aktivieren, dann werden neue Bestellungen halbautomatisch vorbereitet.'}</p>
          <ul>
            <li>${workflow.autoInvoice ? 'Rechnung vorbereiten' : 'Rechnung nicht automatisch vorbereiten'}</li>
            <li>${workflow.autoShippingTask ? 'Versand vorbereiten' : 'Versand nicht automatisch vorbereiten'}</li>
            <li>${workflow.autoQueueReview ? 'Prüfung/Warteschlange vorbereiten' : 'Keine automatische Prüfaufgabe'}</li>
            <li>${workflow.autoSyncGoogleSheets ? 'Google Sheets Abgleich vorbereiten' : 'Google Sheets nur manuell synchronisieren'}</li>
          </ul>
        </div>

        <div class="output-box" style="margin-top:14px">
          <h3>Gespeicherte Vorbereitungen</h3>
          ${preparedPlans.length ? `
            <div class="task-center-list">
              ${preparedPlans.slice(0, 5).map((plan) => buildOrderWorkflowPlanCard(plan)).join('')}
            </div>
          ` : '<p>Noch keine gespeicherte Vorbereitung vorhanden.</p>'}
        </div>

        <div class="output-box" style="margin-top:14px">
          <h3>Offene Bestellungen</h3>
          ${openSales.length
            ? `<ul>${openSales.map((sale) => `<li>${escapeHtml(sale.orderNo || 'ohne Order-ID')} · ${escapeHtml(sale.product || 'Unbekanntes Produkt')} · ${escapeHtml(sale.status || 'Bezahlt')}</li>`).join('')}</ul>`
            : '<p class="muted">Keine offenen Bestellungen gefunden.</p>'}
        </div>
      </div>
    `;
  };

  const buildAgentCard = (def) => {
    const agent = getAgent(def.id) || createDefaultState().agents[def.id];
    const badge = getBadgeMeta(agent);
    const usagePercent = getUsagePercent(agent);
    const activityItems = getActivityLogItems(agent, def);
    return `
      <details class="virtual-agent-card virtual-agent-disclosure virtual-agent-accent-${escapeHtml(def.accent || 'scout')}" data-agent-id="${def.id}" ${state.openCards && state.openCards[def.id] ? 'open' : ''}>
        <summary class="virtual-agent-summary">
          <div class="virtual-agent-summary-top">
            <div class="virtual-agent-ident">
              <div class="virtual-agent-icon">${def.icon}</div>
              <div>
                <h3>${escapeHtml(def.name)}</h3>
                <p>${escapeHtml(def.task)}</p>
              </div>
            </div>
            <span class="virtual-agent-summary-chevron">⌄</span>
          </div>
          <div class="virtual-agent-summary-meta">
            <span class="pill">Modus: ${escapeHtml(MODE_OPTIONS.find((item) => item.value === normalizeMode(agent.mode))?.label || 'nur Vorschläge')}</span>
            <span class="pill">Modell: ${escapeHtml(normalizeModel(agent.model))}</span>
            <span class="pill">Klick zum Aufklappen</span>
          </div>
          <div class="virtual-agent-summary-side" onclick="event.stopPropagation()">
            <span class="virtual-agent-badge ${badge.tone}">${escapeHtml(badge.label)}</span>
            <label class="agent-switch" style="margin-left:2px">
              <input type="checkbox" data-agent-id="${def.id}" data-agent-field="active" ${agent.active ? 'checked' : ''}>
              <span class="agent-switch-track"></span>
              <span>Aktiv / Inaktiv</span>
            </label>
          </div>
        </summary>
        <div class="virtual-agent-body">
          <div class="virtual-agent-mini" style="margin-top:12px">
            <span class="pill">Status: ${escapeHtml(badge.label)}</span>
            <span class="pill">Sicherheitsmodus: ${state.safetyMode !== false ? 'Aktiv' : 'Aus'}</span>
            <span class="pill">Modell: ${escapeHtml(normalizeModel(agent.model))}</span>
            <span class="pill">Heute: ${escapeHtml(formatEuro(agent.usageToday || 0))} / ${escapeHtml(formatEuro(agent.dailyLimit || 0))}</span>
          </div>

          <div class="virtual-agent-grid" style="margin-top:14px">
            <div>
              <label>Status Badge</label>
              <div class="virtual-agent-badge ${badge.tone}" style="width:100%;justify-content:center">${badge.label}</div>
            </div>

            <div>
              <label>Agenten-Status</label>
              <select class="virtual-agent-status-select" data-agent-id="${def.id}" data-agent-field="statusState">
                ${STATUS_OPTIONS.map((item) => `<option value="${item.value}" ${normalizeStatusState(agent.statusState) === item.value ? 'selected' : ''}>${item.label}</option>`).join('')}
              </select>
            </div>

            <div>
              <label>Modus</label>
              <select data-agent-id="${def.id}" data-agent-field="mode">
                ${MODE_OPTIONS.map((item) => `<option value="${item.value}" ${normalizeMode(agent.mode) === item.value ? 'selected' : ''}>${item.label}</option>`).join('')}
              </select>
            </div>

            <div>
              <label class="label-inline">Modell <span class="model-info" title="DeepSeek v4 flash: $0.14 Input / $0.28 Output pro 1M Tokens. DeepSeek v4 pro: $0.435 Input / $0.87 Output pro 1M Tokens, aktuell mit Rabatt bis 2026-05-31. OpenAI gpt-4o mini: $0.15 Input / $0.60 Output pro 1M Tokens. OpenAI gpt-4o: siehe OpenAI-Preisseite.">i</span></label>
              <select data-agent-id="${def.id}" data-agent-field="model">
                ${MODEL_OPTIONS.map((item) => `<option value="${item.value}" ${normalizeModel(agent.model) === item.value ? 'selected' : ''}>${item.label}</option>`).join('')}
              </select>
            </div>

            <div>
              <label>Tageslimit für KI-Kosten (€)</label>
              <input data-agent-id="${def.id}" data-agent-field="dailyLimit" type="number" step="0.01" min="0" value="${Number(agent.dailyLimit || 0).toFixed(2)}">
            </div>

            <label class="agent-switch">
              <input type="checkbox" data-agent-id="${def.id}" data-agent-field="notifications" ${agent.notifications ? 'checked' : ''}>
              <span class="agent-switch-track"></span>
              <span>Benachrichtigungen</span>
            </label>
          </div>

          <div class="virtual-agent-cost">
            <div class="score-top">
              <span class="muted">Heute: ${escapeHtml(formatEuro(agent.usageToday || 0))} / ${escapeHtml(formatEuro(agent.dailyLimit || 0))}</span>
              <strong>${Math.round(usagePercent)}%</strong>
            </div>
            <div class="progress"><div class="bar" style="width:${usagePercent}%"></div></div>
          </div>

          <div style="margin-top:14px">
            <label>Kurze Beschreibung der Aufgabe</label>
            <textarea data-agent-id="${def.id}" data-agent-field="description" placeholder="${escapeHtml(def.description || def.task)}">${escapeHtml(agent.description || def.description || def.task)}</textarea>
          </div>
          <div style="margin-top:14px">
            <label>Prompt für ${escapeHtml(def.name)}</label>
            <div class="output-box" style="margin-top:8px">
              <p>${escapeHtml(previewPromptText(getEffectiveAgentPrompt(def, agent)) || 'Kein Prompt hinterlegt.')}</p>
            </div>
            <div style="display:flex;justify-content:flex-end;margin-top:8px">
              <button
                type="button"
                class="secondary"
                data-agent-action="open-agent-prompt-modal"
                data-agent-id="${escapeHtml(def.id)}"
              >Prompt bearbeiten</button>
            </div>
            <p class="hint">Wirksam ist Bereichs-Prompt + individueller Prompt. Bearbeitung erfolgt im eigenen Fenster mit Promt Vorlage und Deepseek.</p>
          </div>

          <div class="virtual-agent-log">
            <label>Letzte Aktivität</label>
            <ul>
              ${activityItems.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}
            </ul>
            ${agent.lastTestedAt ? `<p class="hint" style="margin-top:10px">Letzter lokaler Test: ${escapeHtml(agent.lastTestedAt)}</p>` : ''}
          </div>

          <div style="margin-top:14px">
            <label>Verwendete KI-Bausteine</label>
            <div class="virtual-agent-connections" style="margin-top:8px">
              ${getConnectionItems(def).map((item) => `<span class="pill">${escapeHtml(item)}</span>`).join('')}
            </div>
          </div>

          <div class="virtual-agent-footer">
            <button type="button" class="secondary" data-agent-action="test-agent" data-agent-id="${def.id}">Agent testen</button>
          </div>

          <div class="output-box" style="margin-top:12px">
            <p>${escapeHtml(agent.lastTestResponse || DEFAULT_TEST_RESPONSE)}</p>
          </div>

          <div class="virtual-agent-footnote">Die Vorschläge dieses Mitarbeiters können später die vorhandenen KI-Funktionen anstoßen, aber aktuell werden noch keine autonomen Aktionen ausgeführt.</div>
        </div>
      </details>
    `;
  };

  const buildCategoryPromptCard = (type, item, contextKey) => {
    const promptValue = item && item.config ? String(item.config.prompt || '') : '';
    const inputId = contextKey
      ? `extendedPermissionModal_${item.id}_prompt_${contextKey}`
      : `extendedPermissionModal_${item.id}_prompt`;
    const promptField = { key: 'prompt' };
    const kindLabel = type === 'role' ? 'Rolle' : 'Funktion';
    const placeholder = type === 'role'
      ? 'Beschreibe, wie diese Rolle entscheiden und freigeben soll.'
      : 'Beschreibe, was diese Funktion prüfen oder vorbereiten soll.';
    return `
      <div class="permission-setting-card" style="margin-top:12px">
        <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px">
          <strong>${escapeHtml(item.title)}</strong>
          <span class="pill">${kindLabel}</span>
        </div>
        <textarea
          id="${escapeHtml(inputId)}"
          data-inline-prompt-type="${type}"
          data-inline-prompt-id="${escapeHtml(item.id)}"
          placeholder="${escapeHtml(placeholder)}"
        >${escapeHtml(promptValue)}</textarea>
        ${renderPromptTemplates(type, item.id, promptField, { targetId: inputId, contextKey })}
        <div style="display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;margin-top:8px">
          <button
            type="button"
            class="secondary"
            data-agent-action="save-inline-prompt"
            data-permission-type="${type}"
            data-permission-id="${escapeHtml(item.id)}"
            data-prompt-input-id="${escapeHtml(inputId)}"
          >Prompt speichern</button>
          <button
            type="button"
            class="secondary"
            data-agent-action="open-extended-permission-settings"
            data-permission-type="${type}"
            data-permission-id="${escapeHtml(item.id)}"
          >⚙️ Einstellungen</button>
        </div>
      </div>
    `;
  };

  const buildCategoryPanel = (panelId, title, description, groupKey, toneClass) => {
    const items = AGENT_DEFS.filter((def) => def.group === groupKey);
    const isActive = activePanel === panelId;
    const areaPrompt = getGroupPromptValue(groupKey);
    return `
      <div class="virtual-agent-card virtual-agents-panel ${isActive ? 'active' : ''}" data-panel="${panelId}">
        <div class="virtual-agent-head">
          <div class="virtual-agent-ident">
            <div class="virtual-agent-icon">${toneClass === 'good' ? '👥' : '🤖'}</div>
            <div>
              <h3>${escapeHtml(title)}</h3>
              <p>${escapeHtml(description)}</p>
            </div>
          </div>
          <span class="virtual-agent-badge ${toneClass}">${items.length} Einträge</span>
        </div>
        <div class="settings-section" style="margin-top:14px">
          <h4>Übergeordnetes Promptfeld (${escapeHtml(AGENT_GROUP_PROMPT_LABELS[groupKey] || groupKey)})</h4>
          <p class="hint">Dieses Prompt gilt zusätzlich für alle Einträge in diesem Bereich.</p>
          <div class="output-box" style="margin-top:8px">
            <p>${escapeHtml(previewPromptText(areaPrompt) || 'Kein Bereichs-Prompt hinterlegt.')}</p>
          </div>
          <div style="display:flex;justify-content:flex-end;margin-top:8px">
            <button
              type="button"
              class="secondary"
              data-agent-action="open-group-prompt-modal"
              data-group-key="${escapeHtml(groupKey)}"
            >Bereichs-Prompt bearbeiten</button>
          </div>
        </div>
        <div class="virtual-agents-panels" style="margin-top:14px">
          ${items.map((def) => buildAgentCard(def)).join('')}
        </div>
      </div>
    `;
  };

  const buildExtendedAutonomyItem = (item, type) => {
    const active = item.status === 'active';
    const canEdit = isExtendedAutonomyEnabled();
    const actionLabel = active ? 'Sperren' : 'Aktivieren';
    const noteText = item.config && item.config.note ? item.config.note : 'Keine Notiz';
    const summaryPills = getExtendedAutonomyCardSummary(type, item);
    return `
      <div class="virtual-future-card autonomy-permission-card ${active ? 'active' : ''}">
        <div class="virtual-agent-ident">
          <div class="virtual-agent-icon">${escapeHtml(item.icon)}</div>
          <div>
            <h4>${escapeHtml(item.title)}</h4>
            <p>${escapeHtml(item.description)}</p>
          </div>
        </div>
        <div class="autonomy-permission-meta">
          ${summaryPills.map((text) => `<span class="pill">${escapeHtml(text)}</span>`).join('')}
          <span class="pill">Notiz: ${escapeHtml(noteText)}</span>
        </div>
        <div class="autonomy-permission-actions">
          <span class="virtual-agent-badge ${active ? 'good' : 'warn'}">${active ? 'Aktiv' : 'Gesperrt'}</span>
          <div class="autonomy-permission-tools">
            <button
              type="button"
              class="secondary gear-button"
              data-agent-action="open-extended-permission-settings"
              data-permission-type="${type}"
              data-permission-id="${escapeHtml(item.id)}"
              ${canEdit ? '' : 'disabled'}
              aria-label="${escapeHtml(item.title)} Einstellungen"
            >⚙️</button>
            <button
              type="button"
              class="${canEdit && active ? 'danger' : 'secondary'}"
              data-agent-action="toggle-extended-permission"
              data-permission-type="${type}"
              data-permission-id="${escapeHtml(item.id)}"
              ${canEdit ? '' : 'disabled'}
            >${actionLabel}</button>
          </div>
        </div>
      </div>
    `;
  };

  const buildExtendedAutonomyCollection = (type, title, description, lockedTitle, activeTitle) => {
    const collection = getExtendedAutonomyCollection(type);
    const lockedItems = collection.filter((item) => item.status !== 'active');
    const activeItems = collection.filter((item) => item.status === 'active');
    const canEdit = isExtendedAutonomyEnabled();
    const isOpen = isExtendedAutonomyCollectionOpen(type);
    return `
      <section class="autonomy-collection-card">
        <div class="autonomy-collection-head">
          <div>
            <h4>${escapeHtml(title)}</h4>
            <p>${escapeHtml(description)}</p>
          </div>
          <div class="autonomy-collection-actions">
            <span class="pill">${activeItems.length} aktiv / ${lockedItems.length} gesperrt</span>
            <button
              type="button"
              class="secondary autonomy-collection-toggle"
              data-agent-action="toggle-extended-collection"
              data-permission-type="${type}"
            >${isOpen ? 'Zuklappen' : 'Aufklappen'}</button>
          </div>
        </div>
        ${isOpen ? `
          ${canEdit ? '' : '<div class="autonomy-lock-note">Erst wenn die erweiterte Autonomie freigeschaltet ist, kannst du Einträge zwischen gesperrt und aktiv verschieben.</div>'}
          <div class="autonomy-registry-grid">
            <div class="autonomy-lane">
              <div class="autonomy-lane-head">
                <div>
                  <h5>${escapeHtml(lockedTitle)}</h5>
                  <p>${canEdit ? 'Einträge sind vorbereitet und können jetzt aktiviert werden.' : 'Aktivieren ist gesperrt, bis die globale Freigabe aktiv ist.'}</p>
                </div>
                <span class="pill">${lockedItems.length} Einträge</span>
              </div>
              <div class="autonomy-permission-list">
                ${lockedItems.length ? lockedItems.map((item) => buildExtendedAutonomyItem(item, type)).join('') : '<div class="autonomy-empty-state">Hier liegen gerade keine gesperrten Einträge.</div>'}
              </div>
            </div>
            <div class="autonomy-lane">
              <div class="autonomy-lane-head">
                <div>
                  <h5>${escapeHtml(activeTitle)}</h5>
                  <p>${canEdit ? 'Aktive Einträge können wieder gesperrt und in die Vorschau zurückgeschoben werden.' : 'Aktive Einträge bleiben sichtbar, aber nicht bearbeitbar.'}</p>
                </div>
                <span class="pill">${activeItems.length} Einträge</span>
              </div>
              <div class="autonomy-permission-list">
                ${activeItems.length ? activeItems.map((item) => buildExtendedAutonomyItem(item, type)).join('') : '<div class="autonomy-empty-state">Hier liegen gerade keine aktiven Einträge.</div>'}
              </div>
            </div>
          </div>
        ` : `<div class="autonomy-empty-state">Der Bereich ist zugeklappt. Mit „${isOpen ? 'Zuklappen' : 'Aufklappen'}“ kannst du ihn wieder anzeigen.</div>`}
      </section>
    `;
  };

  const buildFutureFunctionsSection = () => {
    const isOverviewActive = activePanel === 'overview';
    const securityHint = isSecurityLocked()
      ? 'Live-Aktionen bleiben durch Sicherheitsmodus oder Sandbox blockiert.'
      : 'Live-Aktionen bleiben in dieser Version bewusst getrennt.';
    return `
      <section class="virtual-agent-card virtual-future-section autonomy-registry virtual-agents-panel ${isOverviewActive ? 'active' : ''}" data-panel="overview-autonomy">
        <div class="virtual-future-warning">Erweiterte Autonomie ist der globale Schalter. Mit den Auf-/Zu-Knöpfen klappt jeder Bereich auf oder zu, und das Einstellungsrad passt die einzelnen Einträge an. ${securityHint}</div>
        ${buildExtendedAutonomyCollection(
          'feature',
          'Funktionen',
          'Hier verwaltest du geschützte Funktionsfreigaben. Aktivierte Einträge wandern aus der Vorschau in die aktive Liste und lassen sich später wieder sperren.',
          'Vorschau gesperrter Funktionen',
          'Aktive Funktionen',
        )}
        ${buildExtendedAutonomyCollection(
          'role',
          'Rollen',
          'Hier verwaltest du geschützte Rollenfreigaben. So bleibt sichtbar, was vorbereitet, aktiv oder wieder gesperrt ist.',
          'Vorschau gesperrter Rollen',
          'Aktive Rollen',
        )}
      </section>
    `;
  };

  const render = () => {
    const root = getEl('virtualAgentsSettingsRoot');
    if (!root) return;
    const openCards = {};
    root.querySelectorAll('.virtual-agent-disclosure[open][data-agent-id]').forEach((card) => {
      openCards[card.dataset.agentId] = true;
    });
    state.openCards = openCards;
    const nav = [
      `<button type="button" class="${activePanel === 'overview' ? 'active' : ''}" data-agent-panel="overview">Übersicht</button>`,
      `<button type="button" class="${activePanel === 'order-workflow' ? 'active' : ''}" data-agent-panel="order-workflow">Bestellworkflow</button>`,
      `<button type="button" class="${activePanel === 'ai-task-center' ? 'active' : ''}" data-agent-panel="ai-task-center">AI Task Center</button>`,
      `<button type="button" class="${activePanel === 'ki-agents' ? 'active' : ''}" data-agent-panel="ki-agents">KI-Agenten</button>`,
      `<button type="button" class="${activePanel === 'virtual-ma' ? 'active' : ''}" data-agent-panel="virtual-ma">Virtuelle MA</button>`,
    ].join('');
    const panels = [
      buildOverviewPanel(),
      buildOrderWorkflowPanel(),
      buildTaskCenterPanel(),
      buildCategoryPanel('ki-agents', 'KI-Agenten', 'Strategische Analyse- und Optimierungsrollen für Recherche und Content.', 'ki-agents', 'info'),
      buildCategoryPanel('virtual-ma', 'Virtuelle Mitarbeiter', 'Operative Helfer für Support, Finance und Tagesorganisation.', 'virtual-ma', 'good'),
      activePanel === 'overview' ? buildFutureFunctionsSection() : '',
    ].join('');
    root.innerHTML = `
      <div class="virtual-agents-shell">
        ${buildGlobalStatusBar()}
        <div class="virtual-agents-nav" role="tablist" aria-label="Virtuelle Mitarbeiter Navigation">${nav}</div>
        <div class="virtual-agents-panels">${panels}</div>
      </div>
    `;
  };

  const updateAdvancedAutonomyHoldUI = () => {
    const checkbox = getEl('advancedAutonomyRiskCheckbox');
    const button = getEl('advancedAutonomyHoldBtn');
    const progress = getEl('advancedAutonomyHoldProgress');
    const label = getEl('advancedAutonomyHoldLabel');
    const status = getEl('advancedAutonomyHoldStatus');
    if (!checkbox || !button || !progress || !label || !status) return;
    const enabled = !!checkbox.checked;
    button.disabled = !enabled || isAdvancedAutonomyUnlocked();
    if (isAdvancedAutonomyUnlocked()) {
      label.textContent = 'Bereits entsperrt';
      status.textContent = 'Erweiterte Autonomie ist bereits aktiv.';
      progress.style.width = '100%';
      return;
    }
    if (!enabled) {
      label.textContent = '3 Sekunden halten zum Entsperren';
      status.textContent = 'Sicherheitsbestätigung erforderlich.';
      progress.style.width = '0%';
      button.classList.remove('is-holding');
      return;
    }
    if (!advancedAutonomyHoldActive) {
      label.textContent = '3 Sekunden halten zum Entsperren';
      status.textContent = 'Halte den Button gedrückt, um die experimentelle Autonomie freizuschalten.';
      progress.style.width = '0%';
      button.classList.remove('is-holding');
    }
  };

  const cancelAdvancedAutonomyHold = (message) => {
    if (advancedAutonomyHoldTimer) {
      window.clearTimeout(advancedAutonomyHoldTimer);
      advancedAutonomyHoldTimer = null;
    }
    if (advancedAutonomyHoldFrame) {
      window.cancelAnimationFrame(advancedAutonomyHoldFrame);
      advancedAutonomyHoldFrame = null;
    }
    advancedAutonomyHoldActive = false;
    const button = getEl('advancedAutonomyHoldBtn');
    const progress = getEl('advancedAutonomyHoldProgress');
    const label = getEl('advancedAutonomyHoldLabel');
    const status = getEl('advancedAutonomyHoldStatus');
    if (button) button.classList.remove('is-holding');
    if (progress) progress.style.width = '0%';
    if (label && !isAdvancedAutonomyUnlocked()) label.textContent = '3 Sekunden halten zum Entsperren';
    if (status && !isAdvancedAutonomyUnlocked()) status.textContent = message || 'Vorgang abgebrochen. Erneut gedrückt halten, um zu entsperren.';
  };

  const closeAdvancedAutonomyModal = () => {
    cancelAdvancedAutonomyHold();
    const modal = getEl('advancedAutonomyModal');
    if (modal) modal.classList.add('hidden');
    const checkbox = getEl('advancedAutonomyRiskCheckbox');
    if (checkbox) checkbox.checked = false;
    updateAdvancedAutonomyHoldUI();
  };

  const openAdvancedAutonomyModal = () => {
    const modal = getEl('advancedAutonomyModal');
    const checkbox = getEl('advancedAutonomyRiskCheckbox');
    if (!modal || !checkbox) return;
    checkbox.checked = false;
    modal.classList.remove('hidden');
    window.setTimeout(() => {
      checkbox.focus();
      updateAdvancedAutonomyHoldUI();
    }, 0);
  };

  const unlockAdvancedAutonomy = () => {
    state.advancedMode = true;
    state.autonomyLocked = false;
    saveState();
    render();
    closeAdvancedAutonomyModal();
  };

  const lockAdvancedAutonomy = () => {
    state.advancedMode = false;
    state.autonomyLocked = true;
    saveState();
    render();
  };

  const buildExtendedPermissionOptions = (options, currentValue) => options
    .map((item) => `<option value="${escapeHtml(item.value)}" ${item.value === currentValue ? 'selected' : ''}>${escapeHtml(item.label)}</option>`)
    .join('');

  const getExtendedPermissionFieldValue = (item, field) => {
    const config = item.config || {};
    if (field.key === 'note') return config.note || '';
    if (field.key === 'prompt') return config.prompt || '';
    if (field.kind === 'checkbox') return config[field.key] === true;
    return config[field.key] !== undefined && config[field.key] !== null
      ? String(config[field.key])
      : (field.defaultValue !== undefined ? field.defaultValue : (field.options && field.options[0] ? field.options[0].value : ''));
  };

  const renderPromptTemplates = (type, itemId, field, options) => {
    const def = getExtendedAutonomySettingDefinition(type, itemId);
    const defaults = getExtendedAutonomyDefaults(type);
    const fallback = Array.isArray(defaults) ? defaults.find((entry) => entry.id === itemId) : null;
    const currentItem = findExtendedPermissionItem(type, itemId);
    const aiReady = isAiFeatureEnabled();
    const targetId = options && options.targetId
      ? String(options.targetId)
      : `extendedPermissionModal_${itemId}_${field.key}`;
    const rawContextKey = options && options.contextKey ? String(options.contextKey) : 'modal';
    const safeContextKey = rawContextKey.replace(/[^a-zA-Z0-9_-]/g, '_');
    const panelKey = `${targetId}__${safeContextKey}`;
    const draftId = `promptDraft_${type}_${itemId}_${safeContextKey}`;
    const templates = [
      ...(def && Array.isArray(def.promptTemplates) ? def.promptTemplates : []),
      ...(fallback && Array.isArray(fallback.promptTemplates) ? fallback.promptTemplates : []),
      ...sanitizePromptTemplateList(currentItem && currentItem.config ? currentItem.config.generatedPromptTemplates : []),
    ];
    const uniqueTemplates = templates.filter((template, index, arr) => template && arr.indexOf(template) === index);
    if (!uniqueTemplates.length) return '';
    return `
      <div class="prompt-template-box" style="margin-top:8px">
        <div style="display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap">
          <button
            type="button"
            class="secondary"
            style="padding:6px 10px;font-size:12px;border-radius:999px"
            data-prompt-toggle="${escapeHtml(panelKey)}"
          >Promtvorlage</button>
          <button
            type="button"
            class="secondary"
            style="padding:6px 10px;font-size:12px;border-radius:999px"
            data-prompt-generate="${escapeHtml(type)}"
            data-prompt-id="${escapeHtml(itemId)}"
            data-prompt-context="${escapeHtml(safeContextKey)}"
            ${aiReady ? '' : 'disabled'}
          >${aiReady ? 'Mit DeepSeek' : 'KI aus'}</button>
        </div>
        <div class="prompt-template-panel hidden" data-prompt-panel="${escapeHtml(panelKey)}" style="margin-top:8px;padding:10px;border:1px solid rgba(148,163,184,.18);border-radius:12px;background:rgba(15,23,42,.32)">
          <p class="hint" style="margin:0 0 10px 0">Wähle eine passende Vorlage oder gib einen eigenen deutschen Entwurf ein, den DeepSeek verfeinern kann.</p>
          <div style="margin-bottom:10px">
            <label for="${escapeHtml(draftId)}" class="hint" style="display:block;margin-bottom:6px">Dein deutscher Entwurf</label>
            <textarea
              id="${escapeHtml(draftId)}"
              data-prompt-draft="${escapeHtml(type)}"
              data-prompt-id="${escapeHtml(itemId)}"
              data-prompt-context="${escapeHtml(safeContextKey)}"
              placeholder="Schreibe hier kurz, was die Funktion oder Rolle tun soll. DeepSeek macht daraus einen besseren, längeren Prompt."
              style="min-height:92px"
            >${escapeHtml((currentItem && currentItem.config && currentItem.config.prompt) || '')}</textarea>
          <div style="display:flex;justify-content:flex-end;margin-top:8px">
              <button
                type="button"
                class="secondary"
                style="padding:6px 10px;font-size:12px;border-radius:999px"
                data-prompt-refine="${escapeHtml(type)}"
                data-prompt-id="${escapeHtml(itemId)}"
                data-prompt-context="${escapeHtml(safeContextKey)}"
                ${aiReady ? '' : 'disabled'}
              >${aiReady ? 'Entwurf verfeinern' : 'KI aus'}</button>
            </div>
          </div>
          <div class="virtual-agent-connections" style="display:flex;flex-direction:column;align-items:stretch">
            ${uniqueTemplates.map((template, index) => `
              <button
                type="button"
                class="secondary prompt-template-chip"
                style="width:100%;justify-content:flex-start;text-align:left;white-space:normal"
                data-prompt-template="${escapeHtml(template)}"
                data-prompt-target="${escapeHtml(targetId)}"
              >${index + 1}. ${escapeHtml(template)}</button>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  };

  const buildPromptTemplateGenerationPrompt = (type, item) => {
    const def = getExtendedAutonomySettingDefinition(type, item.id) || {};
    const config = item.config || {};
    const areaLabel = type === 'role'
      ? getAutonomyAreaLabel(config.responsibleArea)
      : getAutonomyAreaLabel(config.targetArea);
    const modeLabel = type === 'role'
      ? getExtendedAutonomyModeLabel(type, config.scope, item.id)
      : getExtendedAutonomyModeLabel(type, config.mode, item.id);
    const extraLines = type === 'role'
      ? [
          `Freigabelevel: ${modeLabel}`,
          `Rechte: ${config.canApprove ? 'darf freigeben' : 'darf nicht freigeben'}; ${config.canLock ? 'darf sperren' : 'darf nicht sperren'}`,
          `Priorität: ${getExtendedAutonomyFieldLabel(type, item.id, 'priority', config.priority, 'Mittel')}`,
        ]
      : [
          `Ausführungsmodus: ${modeLabel}`,
          `Schwelle: ${getExtendedAutonomyFieldLabel(type, item.id, 'threshold', config.threshold, 'Mittel')}`,
          `Autostart: ${config.autoStart ? 'Ja' : 'Nein'}`,
        ];
    return [
      'Du bist ein Prompt-Designer fuer eine deutsche eCommerce-Automation.',
      'Erzeuge exakt 5 unterschiedliche, praxisnahe und deutlich ausformulierte Prompt-Vorlagen als JSON-Array.',
      'Jede Vorlage soll laenger, konkreter und besser auf den Ablauf zugeschnitten sein als ein kurzer Stichpunkt.',
      'Kein Markdown, keine Nummerierung, keine Erklaerung, nur JSON mit Strings.',
      'Jede Vorlage idealerweise 180 bis 320 Zeichen lang.',
      '',
      `Typ: ${getExtendedAutonomyTypeLabel(type)}`,
      `Titel: ${item.title}`,
      `Beschreibung: ${item.description}`,
      `Zuständig/Verknüpft: ${areaLabel}`,
      `Konfiguration: ${JSON.stringify({ ...config, prompt: undefined, generatedPromptTemplates: undefined }, null, 2)}`,
      `Voreinstellung: ${def.subtitle || ''}`,
      ...extraLines,
      '',
      'Ziel: Formuliere Vorlagen, die man direkt als detaillierte Arbeitsanweisung in diesem Bereich verwenden kann.',
    ].join('\n');
  };

  const buildPromptTemplateRefinementPrompt = (type, item, draft) => {
    const def = getExtendedAutonomySettingDefinition(type, item.id) || {};
    const config = item.config || {};
    const areaLabel = type === 'role'
      ? getAutonomyAreaLabel(config.responsibleArea)
      : getAutonomyAreaLabel(config.targetArea);
    const modeLabel = type === 'role'
      ? getExtendedAutonomyModeLabel(type, config.scope, item.id)
      : getExtendedAutonomyModeLabel(type, config.mode, item.id);
    return [
      'Du bist ein deutscher Prompt-Redakteur fuer Elyon.',
      'Verfeinere den folgenden Entwurf zu genau 3 deutlich besseren Prompt-Vorlagen.',
      'Die Vorlagen sollen laenger, konkreter und hilfreicher sein als der Entwurf.',
      'Antworte nur als JSON-Array mit Strings. Kein Markdown, keine Erklaerung.',
      'Jeder String maximal 240 Zeichen.',
      'Nutze die Elyon-Begriffe natuerlich: AI Task Center, KI-Agenten, Virtuelle MA, Freigabe, Sperren, Aktivieren, Vorschau, Autonomie.',
      '',
      `Typ: ${getExtendedAutonomyTypeLabel(type)}`,
      `Titel: ${item.title}`,
      `Beschreibung: ${item.description}`,
      `Bereich: ${areaLabel}`,
      `Modus: ${modeLabel}`,
      `Konfiguration: ${JSON.stringify({ ...config, prompt: undefined, generatedPromptTemplates: undefined }, null, 2)}`,
      `Voreinstellung: ${def.subtitle || ''}`,
      '',
      'Entwurf:',
      draft,
      '',
      'Aufgabe: Formuliere die Vorlagen präziser, vollständiger und mehr auf den konkreten Ablauf bezogen.',
    ].join('\n');
  };

  const extractPromptTemplateList = (data) => {
    const payload = data && data.result ? data.result : data;
    const candidates = [];
    if (Array.isArray(payload)) candidates.push(payload);
    if (payload && Array.isArray(payload.templates)) candidates.push(payload.templates);
    if (payload && Array.isArray(payload.prompts)) candidates.push(payload.prompts);
    if (payload && Array.isArray(payload.items)) candidates.push(payload.items);
    const textCandidates = [];
    if (payload && typeof payload === 'object') {
      ['text', 'output', 'content', 'message', 'result'].forEach((key) => {
        if (typeof payload[key] === 'string') textCandidates.push(payload[key]);
      });
    } else if (typeof payload === 'string') {
      textCandidates.push(payload);
    }
    for (const candidate of candidates) {
      const list = sanitizePromptTemplateList(candidate);
      if (list.length) return list;
    }
    for (const text of textCandidates) {
      const directJson = tryParseJson(text);
      if (Array.isArray(directJson)) {
        const list = sanitizePromptTemplateList(directJson);
        if (list.length) return list;
      }
      if (directJson && Array.isArray(directJson.templates)) {
        const list = sanitizePromptTemplateList(directJson.templates);
        if (list.length) return list;
      }
      const fromLines = sanitizePromptTemplateList(text.split(/\r?\n/).map((line) => line.replace(/^\s*[-*0-9.)]+\s*/, '').trim()));
      if (fromLines.length) return fromLines;
    }
    return [];
  };

  const generatePromptTemplatesForItem = async (type, itemId, triggerButton) => {
    if (!isAiFeatureEnabled()) {
      toast('KI-Funktionen sind deaktiviert. Bitte erst aktivieren.', 'Prompt');
      return;
    }
    const item = findExtendedPermissionItem(type, itemId);
    if (!item) return;
    const button = triggerButton || null;
    if (button) {
      button.disabled = true;
      button.textContent = 'DeepSeek läuft...';
    }
    try {
      const prompt = buildPromptTemplateGenerationPrompt(type, item);
      const data = await requestCentralAi('prompt_templates', prompt, {});
      const list = extractPromptTemplateList(data);
      if (!list.length) {
        throw new Error('DeepSeek hat keine nutzbaren Vorlagen geliefert.');
      }
      updateExtendedAutonomyItem(type, itemId, {
        config: { generatedPromptTemplates: list },
      });
      toast(`DeepSeek hat ${list.length} passende Vorlagen erstellt.`, 'Prompt');
      openExtendedPermissionModal(type, itemId);
    } catch (error) {
      const message = error && error.message ? error.message : 'Vorlagen konnten nicht erzeugt werden.';
      toast(message, 'Prompt');
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = 'Mit DeepSeek';
      }
    }
  };

  const refinePromptDraftForItem = async (type, itemId, triggerButton) => {
    if (!isAiFeatureEnabled()) {
      toast('KI-Funktionen sind deaktiviert. Bitte erst aktivieren.', 'Prompt');
      return;
    }
    const item = findExtendedPermissionItem(type, itemId);
    if (!item) return;
    const contextKey = triggerButton && triggerButton.dataset ? (triggerButton.dataset.promptContext || 'modal') : 'modal';
    const draftField = getEl(`promptDraft_${type}_${itemId}_${contextKey}`) || getEl(`promptDraft_${type}_${itemId}`);
    const draft = draftField ? String(draftField.value || '').trim() : '';
    if (!draft) {
      toast('Bitte zuerst einen deutschen Entwurf eingeben.', 'Prompt');
      return;
    }
    const button = triggerButton || null;
    if (button) {
      button.disabled = true;
      button.textContent = 'DeepSeek verfeinert...';
    }
    try {
      const prompt = buildPromptTemplateRefinementPrompt(type, item, draft);
      const data = await requestCentralAi('prompt_refine', prompt, {});
      const list = extractPromptTemplateList(data);
      if (!list.length) {
        throw new Error('DeepSeek hat keinen nutzbaren Vorschlag geliefert.');
      }
      const refined = sanitizePromptText(list[0], draft);
      updateExtendedAutonomyItem(type, itemId, {
        config: {
          prompt: refined,
          generatedPromptTemplates: list,
        },
      });
      if (draftField) draftField.value = refined;
      toast('Dein Entwurf wurde verfeinert.', 'Prompt');
      openExtendedPermissionModal(type, itemId);
    } catch (error) {
      const message = error && error.message ? error.message : 'Entwurf konnte nicht verfeinert werden.';
      toast(message, 'Prompt');
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = 'Entwurf verfeinern';
      }
    }
  };

  const renderExtendedPermissionField = (type, itemId, field, value) => {
    const fieldId = `extendedPermissionModal_${itemId}_${field.key}`;
    if (field.kind === 'checkbox') {
      return `
        <div class="permission-setting-card">
          <label class="agent-switch" for="${fieldId}">
            <input type="checkbox" id="${fieldId}" data-extended-field="${field.key}" ${value ? 'checked' : ''}>
            <span class="agent-switch-track"></span>
            <span>${escapeHtml(field.label)}</span>
          </label>
          ${field.help ? `<p class="hint">${escapeHtml(field.help)}</p>` : ''}
        </div>
      `;
    }
    if (field.kind === 'textarea') {
      return `
        <div class="permission-setting-card">
          <label for="${fieldId}">${escapeHtml(field.label)}</label>
          <textarea id="${fieldId}" data-extended-field="${field.key}" placeholder="${escapeHtml(field.placeholder || '')}">${escapeHtml(value || '')}</textarea>
          ${field.key === 'prompt' ? renderPromptTemplates(type, itemId, field) : ''}
          ${field.help ? `<p class="hint">${escapeHtml(field.help)}</p>` : ''}
        </div>
      `;
    }
    return `
      <div class="permission-setting-card">
        <label for="${fieldId}">${escapeHtml(field.label)}</label>
        <select id="${fieldId}" data-extended-field="${field.key}">
          ${buildExtendedPermissionOptions(field.options || [], value)}
        </select>
        ${field.help ? `<p class="hint">${escapeHtml(field.help)}</p>` : ''}
      </div>
    `;
  };

  const buildExtendedPermissionFormMarkup = (type, item) => {
    const def = getExtendedAutonomySettingDefinition(type, item.id);
    const fields = def && Array.isArray(def.fields) ? def.fields : [];
    const statusId = `extendedPermissionModalStatus_${item.id}`;
    const statusValue = item.status === 'active' ? 'active' : 'locked';
    return `
      <div class="permission-setting-card">
        <h4>Freigabe</h4>
        <label for="${statusId}">Status</label>
        <select id="${statusId}" data-extended-field="status">
          <option value="locked" ${statusValue === 'locked' ? 'selected' : ''}>Gesperrt</option>
          <option value="active" ${statusValue === 'active' ? 'selected' : ''}>Aktiv</option>
        </select>
      </div>
      ${fields.map((field) => renderExtendedPermissionField(type, item.id, field, getExtendedPermissionFieldValue(item, field))).join('')}
    `;
  };

  const findExtendedPermissionItem = (type, itemId) => getExtendedAutonomyCollection(type).find((item) => item.id === itemId) || null;

  const getAgentPromptTemplates = (agentId) => {
    const def = getDefinition(agentId);
    const agent = getAgent(agentId);
    if (!def || !agent) return [];
    return [
      ...(Array.isArray(def.promptTemplates) ? def.promptTemplates : []),
      ...sanitizePromptTemplateList(agent.generatedPromptTemplates || []),
    ].filter((template, index, arr) => template && arr.indexOf(template) === index);
  };

  const renderAgentPromptTemplateButtons = (agentId) => {
    const templates = getAgentPromptTemplates(agentId);
    if (!templates.length) return '<div class="hint">Keine Vorlagen vorhanden.</div>';
    return templates.map((template, index) => `
      <button
        type="button"
        class="secondary prompt-template-chip"
        style="width:100%;justify-content:flex-start;text-align:left;white-space:normal"
        data-agent-modal-template="${escapeHtml(template)}"
      >${index + 1}. ${escapeHtml(template)}</button>
    `).join('');
  };

  const refreshAgentPromptModalTemplates = () => {
    const list = getEl('agentPromptModalTemplatesList');
    if (!list || !activeAgentPromptSetting) return;
    list.innerHTML = renderAgentPromptTemplateButtons(activeAgentPromptSetting);
  };

  const openAgentPromptModal = (agentId) => {
    const modal = getEl('agentPromptModal');
    const agent = getAgent(agentId);
    const def = getDefinition(agentId);
    if (!modal || !agent || !def) return;
    activeAgentPromptSetting = agentId;
    const title = getEl('agentPromptModalTitle');
    const subtitle = getEl('agentPromptModalSubtitle');
    const kind = getEl('agentPromptModalKind');
    const input = getEl('agentPromptModalInput');
    const panel = getEl('agentPromptModalTemplatesPanel');
    if (title) title.textContent = `Prompt bearbeiten: ${def.name}`;
    if (subtitle) subtitle.textContent = def.group === 'ki-agents'
      ? 'Dieses Prompt gilt nur für diesen KI-Agenten und wird mit dem Bereichs-Prompt kombiniert.'
      : 'Dieses Prompt gilt nur für diesen Virtuellen MA und wird mit dem Bereichs-Prompt kombiniert.';
    if (kind) kind.textContent = def.group === 'ki-agents' ? 'KI-Agent' : 'Virtueller MA';
    if (input) input.value = agent.prompt || def.prompt || '';
    if (panel) panel.classList.add('hidden');
    refreshAgentPromptModalTemplates();
    modal.classList.remove('hidden');
  };

  const closeAgentPromptModal = () => {
    const modal = getEl('agentPromptModal');
    if (modal) modal.classList.add('hidden');
    activeAgentPromptSetting = '';
  };

  const saveAgentPromptModal = () => {
    if (!activeAgentPromptSetting) return;
    const agent = getAgent(activeAgentPromptSetting);
    const def = getDefinition(activeAgentPromptSetting);
    const input = getEl('agentPromptModalInput');
    if (!agent || !def || !input) return;
    agent.prompt = sanitizePromptText(input.value, def.prompt || '');
    saveState();
    render();
    toast(`${def.name}: Prompt gespeichert.`, 'Prompt');
    closeAgentPromptModal();
  };

  const buildAgentPromptRefinementPrompt = (def, draft) => [
    'Du bist Prompt-Optimierer für deutsche eCommerce-Automation.',
    'Verbessere den folgenden Prompt deutlich: präziser, länger, klarer Ablauf, klare Regeln.',
    'Antwort nur als JSON-Array mit genau 5 String-Vorschlägen.',
    'Kein Markdown, keine Erklärung.',
    `Agent/MA: ${def.name}`,
    `Aufgabe: ${def.task}`,
    `Beschreibung: ${def.description}`,
    '',
    'Aktueller Entwurf:',
    draft,
  ].join('\n');

  const refineAgentPromptWithDeepseek = async () => {
    if (!isAiFeatureEnabled()) {
      toast('KI-Funktionen sind deaktiviert. Bitte erst aktivieren.', 'Prompt');
      return;
    }
    if (!activeAgentPromptSetting) return;
    const agentId = activeAgentPromptSetting;
    const agent = getAgent(agentId);
    const def = getDefinition(agentId);
    const input = getEl('agentPromptModalInput');
    const button = getEl('agentPromptModalDeepSeekBtn');
    if (!agent || !def || !input) return;
    const draft = sanitizePromptText(input.value, agent.prompt || def.prompt || '');
    if (!draft) {
      toast('Bitte zuerst einen Entwurf ins Promptfeld schreiben.', 'Prompt');
      return;
    }
    if (button) {
      button.disabled = true;
      button.textContent = 'Deepseek läuft...';
    }
    try {
      const requestPrompt = buildAgentPromptRefinementPrompt(def, draft);
      const data = await requestCentralAi('prompt_refine', requestPrompt, {});
      const list = extractPromptTemplateList(data);
      if (!list.length) {
        throw new Error('Deepseek hat keinen nutzbaren Vorschlag geliefert.');
      }
      const refined = sanitizePromptText(list[0], draft);
      agent.prompt = refined;
      agent.generatedPromptTemplates = sanitizePromptTemplateList([
        ...(agent.generatedPromptTemplates || []),
        ...list,
      ]);
      input.value = refined;
      saveState();
      refreshAgentPromptModalTemplates();
      toast(`${def.name}: Prompt mit Deepseek verfeinert.`, 'Prompt');
    } catch (error) {
      const message = error && error.message ? error.message : 'Deepseek konnte den Prompt nicht verfeinern.';
      toast(message, 'Prompt');
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = 'Deepseek';
      }
    }
  };

  const getGroupPromptTemplates = (groupKey) => {
    const defs = AGENT_DEFS.filter((def) => def.group === groupKey);
    return defs
      .flatMap((def) => Array.isArray(def.promptTemplates) ? def.promptTemplates : [])
      .map((item) => sanitizePromptText(item, ''))
      .filter((template, index, arr) => template && arr.indexOf(template) === index)
      .slice(0, 10);
  };

  const renderGroupPromptTemplateButtons = (groupKey) => {
    const templates = getGroupPromptTemplates(groupKey);
    if (!templates.length) return '<div class="hint">Keine Vorlagen vorhanden.</div>';
    return templates.map((template, index) => `
      <button
        type="button"
        class="secondary prompt-template-chip"
        style="width:100%;justify-content:flex-start;text-align:left;white-space:normal"
        data-group-modal-template="${escapeHtml(template)}"
      >${index + 1}. ${escapeHtml(template)}</button>
    `).join('');
  };

  const refreshGroupPromptModalTemplates = () => {
    const list = getEl('groupPromptModalTemplatesList');
    if (!list || !activeGroupPromptSetting) return;
    list.innerHTML = renderGroupPromptTemplateButtons(activeGroupPromptSetting);
  };

  const openGroupPromptModal = (groupKey) => {
    if (!Object.prototype.hasOwnProperty.call(AGENT_GROUP_PROMPT_LABELS, groupKey)) return;
    const modal = getEl('groupPromptModal');
    const title = getEl('groupPromptModalTitle');
    const subtitle = getEl('groupPromptModalSubtitle');
    const kind = getEl('groupPromptModalKind');
    const input = getEl('groupPromptModalInput');
    const panel = getEl('groupPromptModalTemplatesPanel');
    if (!modal || !input) return;
    activeGroupPromptSetting = groupKey;
    const groupLabel = AGENT_GROUP_PROMPT_LABELS[groupKey] || groupKey;
    if (title) title.textContent = `Bereichs-Prompt: ${groupLabel}`;
    if (subtitle) subtitle.textContent = `Dieser Prompt gilt zusätzlich für alle Einträge in ${groupLabel}.`;
    if (kind) kind.textContent = groupLabel;
    input.value = getGroupPromptValue(groupKey);
    if (panel) panel.classList.add('hidden');
    refreshGroupPromptModalTemplates();
    modal.classList.remove('hidden');
  };

  const closeGroupPromptModal = () => {
    const modal = getEl('groupPromptModal');
    if (modal) modal.classList.add('hidden');
    activeGroupPromptSetting = '';
  };

  const saveGroupPromptModal = () => {
    if (!activeGroupPromptSetting) return;
    const input = getEl('groupPromptModalInput');
    if (!input) return;
    const groupKey = activeGroupPromptSetting;
    const groupLabel = AGENT_GROUP_PROMPT_LABELS[groupKey] || groupKey;
    state.groupPrompts = state.groupPrompts && typeof state.groupPrompts === 'object'
      ? { ...state.groupPrompts }
      : {};
    state.groupPrompts[groupKey] = sanitizePromptText(input.value, '');
    saveState();
    render();
    toast(`${groupLabel}: Bereichs-Prompt gespeichert.`, 'Prompt');
    closeGroupPromptModal();
  };

  const buildGroupPromptRefinementPrompt = (groupKey, draft) => {
    const groupLabel = AGENT_GROUP_PROMPT_LABELS[groupKey] || groupKey;
    const defs = AGENT_DEFS.filter((def) => def.group === groupKey);
    const tasks = defs.map((def) => `- ${def.name}: ${def.task}`).join('\n');
    return [
      'Du bist Prompt-Optimierer für deutsche eCommerce-Automation.',
      'Verbessere den folgenden Bereichs-Prompt deutlich: präziser, länger, klarer Ablauf, klare Regeln.',
      'Antwort nur als JSON-Array mit genau 5 String-Vorschlägen.',
      'Kein Markdown, keine Erklärung.',
      `Bereich: ${groupLabel}`,
      'Gilt für diese Einträge:',
      tasks || '- Keine Einträge',
      '',
      'Aktueller Entwurf:',
      draft,
    ].join('\n');
  };

  const refineGroupPromptWithDeepseek = async () => {
    if (!isAiFeatureEnabled()) {
      toast('KI-Funktionen sind deaktiviert. Bitte erst aktivieren.', 'Prompt');
      return;
    }
    if (!activeGroupPromptSetting) return;
    const groupKey = activeGroupPromptSetting;
    const groupLabel = AGENT_GROUP_PROMPT_LABELS[groupKey] || groupKey;
    const input = getEl('groupPromptModalInput');
    const button = getEl('groupPromptModalDeepSeekBtn');
    if (!input) return;
    const draft = sanitizePromptText(input.value, getGroupPromptValue(groupKey));
    if (!draft) {
      toast('Bitte zuerst einen Entwurf ins Promptfeld schreiben.', 'Prompt');
      return;
    }
    if (button) {
      button.disabled = true;
      button.textContent = 'Deepseek läuft...';
    }
    try {
      const requestPrompt = buildGroupPromptRefinementPrompt(groupKey, draft);
      const data = await requestCentralAi('prompt_refine', requestPrompt, {});
      const list = extractPromptTemplateList(data);
      if (!list.length) {
        throw new Error('Deepseek hat keinen nutzbaren Vorschlag geliefert.');
      }
      const refined = sanitizePromptText(list[0], draft);
      input.value = refined;
      state.groupPrompts = state.groupPrompts && typeof state.groupPrompts === 'object'
        ? { ...state.groupPrompts }
        : {};
      state.groupPrompts[groupKey] = refined;
      saveState();
      render();
      refreshGroupPromptModalTemplates();
      toast(`${groupLabel}: Bereichs-Prompt mit Deepseek verfeinert.`, 'Prompt');
    } catch (error) {
      const message = error && error.message ? error.message : 'Deepseek konnte den Bereichs-Prompt nicht verfeinern.';
      toast(message, 'Prompt');
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = 'Deepseek';
      }
    }
  };

  const openExtendedPermissionModal = (type, itemId) => {
    const modal = getEl('extendedPermissionModal');
    const item = findExtendedPermissionItem(type, itemId);
    if (!modal || !item) return;
    activeExtendedAutonomySetting = { type, id: itemId };
    const title = getEl('extendedPermissionModalTitle');
    const subtitle = getEl('extendedPermissionModalSubtitle');
    const kind = getEl('extendedPermissionModalKind');
    const statusLabel = getEl('extendedPermissionModalStatusLabel');
    const itemTitle = getEl('extendedPermissionModalItemTitle');
    const itemDescription = getEl('extendedPermissionModalItemDescription');
    const fieldsRoot = getEl('extendedPermissionModalFields');
    const def = getExtendedAutonomySettingDefinition(type, item.id);
    if (title) title.textContent = `${getExtendedAutonomyTypeLabel(type)} einstellen`;
    if (subtitle) subtitle.textContent = (def && def.subtitle) || (type === 'role'
      ? 'Hier passt du Verantwortung, Rechte und Priorität dieser Rolle an.'
      : 'Hier passt du Verhalten, Schwelle und Startlogik dieser Funktion an.');
    if (kind) kind.textContent = getExtendedAutonomyTypeLabel(type);
    if (statusLabel) statusLabel.textContent = `Aktuelle ${getExtendedAutonomyTypeLabel(type)}-Konfiguration`;
    if (itemTitle) itemTitle.textContent = item.title;
    if (itemDescription) itemDescription.textContent = item.description;
    if (fieldsRoot) fieldsRoot.innerHTML = buildExtendedPermissionFormMarkup(type, item);
    modal.classList.remove('hidden');
  };

  const closeExtendedPermissionModal = () => {
    const modal = getEl('extendedPermissionModal');
    if (modal) modal.classList.add('hidden');
    activeExtendedAutonomySetting = { type: 'feature', id: '' };
  };

  const saveExtendedPermissionModal = () => {
    const { type, id } = activeExtendedAutonomySetting;
    if (!type || !id) return;
    const modal = getEl('extendedPermissionModal');
    const current = findExtendedPermissionItem(type, id);
    const def = getExtendedAutonomySettingDefinition(type, id);
    if (!modal || !current || !def) return;
    const fieldsRoot = getEl('extendedPermissionModalFields');
    const status = fieldsRoot ? fieldsRoot.querySelector('[data-extended-field="status"]') : null;
    const nextConfig = { ...(current.config || {}) };
    def.fields.forEach((field) => {
      const input = fieldsRoot ? fieldsRoot.querySelector(`[data-extended-field="${field.key}"]`) : null;
      if (!input) return;
      if (field.kind === 'checkbox') {
        nextConfig[field.key] = !!input.checked;
        return;
      }
      nextConfig[field.key] = field.key === 'prompt'
        ? sanitizePromptText(input.value, '')
        : sanitizeActivity(input.value, '');
    });
    updateExtendedAutonomyItem(type, id, {
      status: status && status.value === 'active' ? 'active' : 'locked',
      config: nextConfig,
    });
    toast(`${current.title} wurde gespeichert.`, 'Konfiguration');
    closeExtendedPermissionModal();
  };

  const startAdvancedAutonomyHold = (event) => {
    const checkbox = getEl('advancedAutonomyRiskCheckbox');
    const button = getEl('advancedAutonomyHoldBtn');
    const progress = getEl('advancedAutonomyHoldProgress');
    const label = getEl('advancedAutonomyHoldLabel');
    const status = getEl('advancedAutonomyHoldStatus');
    if (!checkbox || !button || !progress || !label || !status || !checkbox.checked || isAdvancedAutonomyUnlocked()) return;
    if (typeof event.pointerId === 'number' && button.setPointerCapture) {
      try {
        button.setPointerCapture(event.pointerId);
      } catch (captureError) {
        // Ignore capture failures and continue with the hold timer.
      }
    }
    cancelAdvancedAutonomyHold();
    advancedAutonomyHoldActive = true;
    advancedAutonomyHoldStart = performance.now();
    button.classList.add('is-holding');
    status.textContent = 'Halten läuft ... bitte gedrückt lassen.';
    const tick = () => {
      if (!advancedAutonomyHoldActive) return;
      const elapsed = performance.now() - advancedAutonomyHoldStart;
      const percent = Math.max(0, Math.min(100, (elapsed / 3000) * 100));
      progress.style.width = `${percent}%`;
      label.textContent = percent >= 100 ? 'Freischaltung wird bestätigt ...' : '3 Sekunden halten zum Entsperren';
      if (percent >= 100) return;
      advancedAutonomyHoldFrame = window.requestAnimationFrame(tick);
    };
    advancedAutonomyHoldFrame = window.requestAnimationFrame(tick);
    advancedAutonomyHoldTimer = window.setTimeout(() => {
      if (!advancedAutonomyHoldActive) return;
      unlockAdvancedAutonomy();
    }, 3000);
  };

  const setPanel = (panel) => {
    activePanel = normalizePanel(panel);
    state.activePanel = activePanel;
    saveState();
    render();
  };

  const resetAllAgents = () => {
    const defaults = createDefaultState();
    state.agents = defaults.agents;
    state.securityMode = defaults.securityMode;
    state.sandboxMode = defaults.sandboxMode;
    state.advancedMode = defaults.advancedMode;
    state.autonomyLocked = defaults.autonomyLocked;
    state.pausedAll = defaults.pausedAll;
    state.pauseAllAgents = defaults.pauseAllAgents;
    state.masterAgentsDisabled = defaults.masterAgentsDisabled;
    state.masterAgentsSnapshot = defaults.masterAgentsSnapshot;
    state.safetyMode = defaults.safetyMode;
    state.extendedAutonomyPanels = defaults.extendedAutonomyPanels;
    state.extendedAutonomyFeatures = defaults.extendedAutonomyFeatures;
    state.extendedAutonomyRoles = defaults.extendedAutonomyRoles;
    state.groupPrompts = defaults.groupPrompts;
    activePanel = 'overview';
    state.activePanel = activePanel;
    saveState();
    render();
  };

  const toggleMasterAgents = () => {
    const nextDisabled = !isMasterAgentsDisabled();
    if (nextDisabled) {
      const snapshot = {
        agents: {},
        pauseAllAgents: state.pauseAllAgents === true,
        pausedAll: state.pausedAll === true,
      };
      AGENT_DEFS.forEach((def) => {
        const agent = getAgent(def.id);
        snapshot.agents[def.id] = !!(agent && agent.active);
        if (agent) agent.active = false;
      });
      state.masterAgentsSnapshot = snapshot;
      state.masterAgentsDisabled = true;
      state.pauseAllAgents = true;
      state.pausedAll = true;
    } else {
      const snapshot = state.masterAgentsSnapshot && typeof state.masterAgentsSnapshot === 'object' ? state.masterAgentsSnapshot : {};
      const agentSnapshot = snapshot.agents && typeof snapshot.agents === 'object' ? snapshot.agents : {};
      AGENT_DEFS.forEach((def) => {
        const agent = getAgent(def.id);
        if (!agent) return;
        agent.active = typeof agentSnapshot[def.id] === 'boolean' ? agentSnapshot[def.id] : true;
      });
      state.pauseAllAgents = typeof snapshot.pauseAllAgents === 'boolean' ? snapshot.pauseAllAgents : false;
      state.pausedAll = typeof snapshot.pausedAll === 'boolean' ? snapshot.pausedAll : state.pauseAllAgents;
      state.masterAgentsDisabled = false;
      state.masterAgentsSnapshot = {};
    }
    saveState();
    render();
  };

  const handleFieldChange = (target) => {
    const agentId = target.dataset.agentId;
    const field = target.dataset.agentField;
    if (!agentId || !field) return;
    const agent = getAgent(agentId);
    const def = getDefinition(agentId);
    if (!agent || !def) return;

    if (field === 'active' || field === 'notifications') {
      agent[field] = !!target.checked;
    } else if (field === 'safetyMode') {
      state.safetyMode = !!target.checked;
      state.securityMode = state.safetyMode;
    } else if (field === 'mode') {
      agent.mode = normalizeMode(target.value);
    } else if (field === 'model') {
      agent.model = normalizeModel(target.value);
    } else if (field === 'dailyLimit') {
      agent.dailyLimit = normalizeLimit(target.value);
      target.value = Number(agent.dailyLimit || 0).toFixed(2);
    } else if (field === 'description') {
      agent.description = sanitizeDescription(target.value, def.task);
    } else if (field === 'prompt') {
      agent.prompt = sanitizePromptText(target.value, def.prompt || '');
    } else if (field === 'statusState') {
      agent.statusState = normalizeStatusState(target.value);
    } else if (field === 'taskStatus') {
      handleTaskAction(target.dataset.taskId, normalizeTaskStatus(target.value));
    }

    saveState();
    render();
  };

  const pauseAllAgents = () => {
    const next = !isAllAgentsPaused();
    if (next) {
      AGENT_DEFS.forEach((def) => {
        const agent = getAgent(def.id);
        if (agent) agent.active = false;
      });
      state.pauseAllSnapshot = {};
      state.pausedAll = true;
      state.pauseAllAgents = true;
    } else {
      AGENT_DEFS.forEach((def) => {
        const agent = getAgent(def.id);
        if (!agent) return;
        agent.active = isMasterAgentsDisabled() ? false : true;
      });
      state.pauseAllSnapshot = {};
      state.pausedAll = false;
      state.pauseAllAgents = false;
    }
    saveState();
    render();
  };

  const runAgentTest = (agentId) => {
    const agent = getAgent(agentId);
    const def = getDefinition(agentId);
    if (!agent || !def) return;
    const response = getTestResponse(def);
    agent.lastTestResponse = response;
    agent.lastActivity = 'Letzte Prüfung vorbereitet';
    agent.lastTestedAt = new Date().toLocaleString('de-DE');
    agent.statusState = 'Analysiert';
    agent.usageToday = Math.min(Number(agent.dailyLimit || 0), Math.round(((Number(agent.usageToday) || 0) + getUsageDelta(agentId)) * 100) / 100);
    saveState();
    render();
  };

  const openAgentSettings = () => {
    const modal = getEl('settingsModal');
    if (modal) modal.classList.add('hidden');
    if (typeof window.showTab === 'function') {
      window.showTab('virtualAgentsTab');
    }
    window.setTimeout(() => {
      const root = getEl('virtualAgentsSettingsRoot');
      if (root) root.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 120);
  };

  const bind = () => {
    const root = getEl('virtualAgentsSettingsRoot');
    if (!root || root.dataset.virtualAgentsBound === 'yes') return;
    root.dataset.virtualAgentsBound = 'yes';

    root.addEventListener('click', (event) => {
      const panelButton = event.target.closest('[data-agent-panel]');
      if (panelButton) {
        setPanel(panelButton.dataset.agentPanel);
        return;
      }
      const resetButton = event.target.closest('[data-agent-action="reset-all"]');
      if (resetButton) {
        if (window.confirm('Alle virtuellen Mitarbeiter auf Standardwerte zurücksetzen?')) {
          resetAllAgents();
        }
        return;
      }
      const pauseAllButton = event.target.closest('[data-agent-action="pause-all"]');
      if (pauseAllButton) {
        pauseAllAgents();
        return;
      }
      const masterToggleButton = event.target.closest('[data-agent-action="master-toggle-all"]');
      if (masterToggleButton) {
        toggleMasterAgents();
        return;
      }
      const openAutonomyButton = event.target.closest('[data-agent-action="open-advanced-autonomy"]');
      if (openAutonomyButton) {
        openAdvancedAutonomyModal();
        return;
      }
      const lockAutonomyButton = event.target.closest('[data-agent-action="lock-advanced-autonomy"]');
      if (lockAutonomyButton) {
        lockAdvancedAutonomy();
        return;
      }
      const extendedCollectionButton = event.target.closest('[data-agent-action="toggle-extended-collection"]');
      if (extendedCollectionButton) {
        const permissionType = extendedCollectionButton.dataset.permissionType === 'role' ? 'role' : 'feature';
        const nextOpen = !isExtendedAutonomyCollectionOpen(permissionType);
        setExtendedAutonomyCollectionOpen(permissionType, nextOpen);
        saveState();
        render();
        return;
      }
      const extendedPermissionSettingsButton = event.target.closest('[data-agent-action="open-extended-permission-settings"]');
      if (extendedPermissionSettingsButton) {
        const permissionType = extendedPermissionSettingsButton.dataset.permissionType === 'role' ? 'role' : 'feature';
        const permissionId = extendedPermissionSettingsButton.dataset.permissionId;
        openExtendedPermissionModal(permissionType, permissionId);
        return;
      }
      const generatePromptButton = event.target.closest('[data-agent-action="generate-agent-prompt"]');
      if (generatePromptButton) {
        generateAgentPrompt(generatePromptButton.dataset.agentId);
        return;
      }
      const openInstructionsButton = event.target.closest('[data-agent-action="open-agent-instructions"]');
      if (openInstructionsButton) {
        openAgentInstructionsModal(openInstructionsButton.dataset.agentId);
        return;
      }
      const openFutureSettingsButton = event.target.closest('[data-future-action="open-future-settings"]');
      if (openFutureSettingsButton) {
        event.preventDefault();
        event.stopPropagation();
        openFutureSettingsModal(openFutureSettingsButton.dataset.futureKind, openFutureSettingsButton.dataset.futureId);
        return;
      }
      const closeInstructionsButton = event.target.closest('[data-agent-action="close-agent-instructions"]');
      if (closeInstructionsButton) {
        closeAgentInstructionsModal();
        return;
      }
      const futureCapabilityButton = event.target.closest('[data-future-action="toggle-future-capability"]');
      if (futureCapabilityButton) {
        event.preventDefault();
        event.stopPropagation();
        toggleFutureCapability(futureCapabilityButton.dataset.futureKind, futureCapabilityButton.dataset.futureId);
        return;
      }
      const workflowActionButton = event.target.closest('[data-order-workflow-action]');
      if (workflowActionButton) {
        const action = workflowActionButton.dataset.orderWorkflowAction;
        if (action === 'save') {
          saveOrderWorkflowSettings(getOrderWorkflowSettings());
          setTaskCenterNotice('Bestellworkflow gespeichert.');
        } else if (action === 'toggle-note-lock') {
          event.preventDefault();
          event.stopPropagation();
          const current = getOrderWorkflowSettings();
          const nextLocked = current.noteLocked === false;
          saveOrderWorkflowSettings({ noteLocked: nextLocked });
          setTaskCenterNotice(nextLocked ? 'Workflow-Notiz gesperrt.' : 'Workflow-Notiz freigeschaltet.');
        } else if (action === 'apply-open') {
          const items = getOpenWorkflowSales();
          if (!items.length) {
            setTaskCenterNotice('Keine offenen Bestellungen für den Workflow gefunden.');
          } else {
            const results = runOrderWorkflowForSales(items, 'manuell');
            setTaskCenterNotice(`${results.length} offene Bestellung(en) in den Workflow übernommen.`);
          }
        }
        return;
      }
      const workflowButton = event.target.closest('[data-agent-action="run-agent-workflow"]');
      if (workflowButton) {
        const result = runAgentWorkflow(workflowButton.dataset.agentId);
        if (result) {
          setTaskCenterNotice(`Lokale Analyse für ${getDefinition(workflowButton.dataset.agentId)?.name || 'Agent'} vorbereitet.`);
          render();
        }
        return;
      }
      const saveInlinePromptButton = event.target.closest('[data-agent-action="save-inline-prompt"]');
      if (saveInlinePromptButton) {
        const permissionType = saveInlinePromptButton.dataset.permissionType === 'role' ? 'role' : 'feature';
        const permissionId = saveInlinePromptButton.dataset.permissionId;
        const item = findExtendedPermissionItem(permissionType, permissionId);
        if (!item) return;
        const promptInputId = saveInlinePromptButton.dataset.promptInputId || `extendedPermissionModal_${permissionId}_prompt`;
        const promptField = getEl(promptInputId);
        const nextPrompt = sanitizePromptText(
          promptField ? promptField.value : '',
          (item.config && item.config.prompt) || '',
        );
        updateExtendedAutonomyItem(permissionType, permissionId, {
          config: { prompt: nextPrompt },
        });
        toast(`${item.title}: Prompt gespeichert.`, 'Prompt');
        return;
      }
      const openAgentPromptModalButton = event.target.closest('[data-agent-action="open-agent-prompt-modal"]');
      if (openAgentPromptModalButton) {
        const agentId = openAgentPromptModalButton.dataset.agentId;
        if (!agentId) return;
        openAgentPromptModal(agentId);
        return;
      }
      const openGroupPromptModalButton = event.target.closest('[data-agent-action="open-group-prompt-modal"]');
      if (openGroupPromptModalButton) {
        const groupKey = openGroupPromptModalButton.dataset.groupKey;
        if (!groupKey) return;
        openGroupPromptModal(groupKey);
        return;
      }
      const taskFilterButton = event.target.closest('[data-task-filter-group][data-task-filter-value]');
      if (taskFilterButton) {
        const filterGroup = taskFilterButton.dataset.taskFilterGroup;
        const filterValue = taskFilterButton.dataset.taskFilterValue;
        if (filterGroup === 'status') {
          setTaskStatusFilter(filterValue);
        } else if (filterGroup === 'priority') {
          setTaskPriorityFilter(filterValue);
        }
        return;
      }
      const taskActionButton = event.target.closest('[data-task-action]');
      if (taskActionButton) {
        if (taskActionButton.dataset.taskAction === 'create-task') {
          const titleInput = getEl('aiTaskTitleInput');
          const descInput = getEl('aiTaskDescriptionInput');
          const agentSelect = getEl('aiTaskAgentSelect');
          const typeSelect = getEl('aiTaskTypeSelect');
          const prioritySelect = getEl('aiTaskPrioritySelect');
          createAiTask({
            title: titleInput ? titleInput.value : 'Neue Aufgabe',
            description: descInput ? descInput.value : '',
            agentId: agentSelect ? agentSelect.value : '',
            agentType: agentSelect && agentSelect.value ? (getAgent(agentSelect.value)?.mode || '') : '',
            type: typeSelect ? typeSelect.value : 'product_analysis',
            priority: prioritySelect ? normalizeTaskPriority(prioritySelect.value) : 'normal',
            input: {
              source: 'task-center-form',
              safeTask: AI_TASK_SAFE_TYPES.includes(typeSelect ? typeSelect.value : 'product_analysis'),
            },
          });
          setTaskCenterNotice('Neue Aufgabe wurde gespeichert und zur Verarbeitung vorbereitet.');
          return;
        }
        handleTaskAction(taskActionButton.dataset.taskId, taskActionButton.dataset.taskAction);
        return;
      }
      const testButton = event.target.closest('[data-agent-action="test-agent"]');
      if (testButton) {
        runAgentTest(testButton.dataset.agentId);
      }
    });

    root.addEventListener('change', (event) => {
      const target = event.target;
      if (target && target.dataset && target.dataset.orderWorkflowField) {
        const field = target.dataset.orderWorkflowField;
        const current = getOrderWorkflowSettings();
        const next = { ...current };
        if (field === 'enabled' || field === 'autoInvoice' || field === 'autoShippingTask' || field === 'autoSyncGoogleSheets' || field === 'autoQueueReview') {
          next[field] = !!target.checked;
        } else if (field === 'mode') {
          next.mode = target.value === 'manual' ? 'manual' : 'semi';
        } else if (field === 'note') {
          if (current.noteLocked !== false) {
            return;
          }
          next.note = target.value || '';
        }
        saveOrderWorkflowSettings(next);
        return;
      }
      if (target && target.dataset && target.dataset.agentField) {
        handleFieldChange(target);
        return;
      }
      if (target && target.dataset && target.dataset.taskField === 'status') {
        handleTaskAction(target.dataset.taskId, normalizeTaskStatus(target.value));
      }
    });
  };

  const bindTaskRemoveModal = () => {
    const modal = getEl('taskRemoveModal');
    const cancelBtn = getEl('taskRemoveCancelBtn');
    const confirmBtn = getEl('taskRemoveConfirmBtn');
    if (cancelBtn && !cancelBtn.dataset.bound) {
      cancelBtn.dataset.bound = 'yes';
      cancelBtn.addEventListener('click', closeTaskRemoveModal);
    }
    if (confirmBtn && !confirmBtn.dataset.bound) {
      confirmBtn.dataset.bound = 'yes';
      confirmBtn.addEventListener('click', confirmTaskRemoval);
    }
    if (modal && !modal.dataset.bound) {
      modal.dataset.bound = 'yes';
      modal.addEventListener('click', (event) => {
        if (event.target === modal) {
          closeTaskRemoveModal();
        }
      });
    }
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        closeAdvancedAutonomyModal();
        closeExtendedPermissionModal();
        closeAgentPromptModal();
        closeGroupPromptModal();
        closeTaskRemoveModal();
      }
    });
  };

  document.addEventListener('click', (event) => {
    const modal = getEl('advancedAutonomyModal');
    if (!modal || modal.classList.contains('hidden')) return;
    if (event.target === modal) {
      closeAdvancedAutonomyModal();
    }
  });

  document.addEventListener('click', (event) => {
    const modal = getEl('extendedPermissionModal');
    if (!modal || modal.classList.contains('hidden')) return;
    if (event.target === modal) {
      closeExtendedPermissionModal();
    }
  });

  document.addEventListener('click', (event) => {
    const modal = getEl('agentPromptModal');
    if (!modal || modal.classList.contains('hidden')) return;
    if (event.target === modal) {
      closeAgentPromptModal();
    }
  });

  document.addEventListener('click', (event) => {
    const modal = getEl('groupPromptModal');
    if (!modal || modal.classList.contains('hidden')) return;
    if (event.target === modal) {
      closeGroupPromptModal();
    }
  });

  document.addEventListener('click', (event) => {
    const templateButton = event.target.closest('[data-agent-modal-template]');
    if (!templateButton) return;
    const input = getEl('agentPromptModalInput');
    if (!input) return;
    input.value = templateButton.dataset.agentModalTemplate || '';
    input.focus();
  });

  document.addEventListener('click', (event) => {
    const templateButton = event.target.closest('[data-group-modal-template]');
    if (!templateButton) return;
    const input = getEl('groupPromptModalInput');
    if (!input) return;
    input.value = templateButton.dataset.groupModalTemplate || '';
    input.focus();
  });

  document.addEventListener('click', (event) => {
    const templateButton = event.target.closest('[data-prompt-template]');
    if (!templateButton) return;
    const targetId = templateButton.dataset.promptTarget;
    const target = targetId ? getEl(targetId) : null;
    if (!target) return;
    target.value = templateButton.dataset.promptTemplate || '';
    target.focus();
  });

  document.addEventListener('click', (event) => {
    const toggleButton = event.target.closest('[data-prompt-toggle]');
    if (!toggleButton) return;
    const panelId = toggleButton.dataset.promptToggle;
    const panel = panelId ? document.querySelector(`[data-prompt-panel="${panelId}"]`) : null;
    if (!panel) return;
    panel.classList.toggle('hidden');
  });

  document.addEventListener('click', (event) => {
    const generateButton = event.target.closest('[data-prompt-generate]');
    if (!generateButton) return;
    const type = generateButton.dataset.promptGenerate === 'role' ? 'role' : 'feature';
    const itemId = generateButton.dataset.promptId;
    if (!itemId) return;
    generatePromptTemplatesForItem(type, itemId, generateButton);
  });

  document.addEventListener('click', (event) => {
    const refineButton = event.target.closest('[data-prompt-refine]');
    if (!refineButton) return;
    const type = refineButton.dataset.promptRefine === 'role' ? 'role' : 'feature';
    const itemId = refineButton.dataset.promptId;
    if (!itemId) return;
    refinePromptDraftForItem(type, itemId, refineButton);
  });

  window.openVirtualAgentsSettings = openAgentSettings;
  window.renderVirtualAgentsSettings = render;
  window.reloadVirtualAgentsSettings = () => {
    const next = loadState();
    Object.assign(state, next);
    activePanel = normalizePanel(state.activePanel);
    render();
  };

  document.addEventListener('DOMContentLoaded', () => {
    bind();
    bindTaskRemoveModal();
    render();
    const advancedAutonomyCheckbox = getEl('advancedAutonomyRiskCheckbox');
    const advancedAutonomyHoldBtn = getEl('advancedAutonomyHoldBtn');
    const advancedAutonomyCloseBtn = getEl('advancedAutonomyCloseBtn');
    const extendedPermissionSaveBtn = getEl('extendedPermissionModalSaveBtn');
    const extendedPermissionCloseBtn = getEl('extendedPermissionModalCloseBtn');
    const agentPromptTemplatesBtn = getEl('agentPromptModalTemplatesBtn');
    const agentPromptDeepSeekBtn = getEl('agentPromptModalDeepSeekBtn');
    const agentPromptSaveBtn = getEl('agentPromptModalSaveBtn');
    const agentPromptCloseBtn = getEl('agentPromptModalCloseBtn');
    const groupPromptTemplatesBtn = getEl('groupPromptModalTemplatesBtn');
    const groupPromptDeepSeekBtn = getEl('groupPromptModalDeepSeekBtn');
    const groupPromptSaveBtn = getEl('groupPromptModalSaveBtn');
    const groupPromptCloseBtn = getEl('groupPromptModalCloseBtn');
    if (advancedAutonomyCheckbox) {
      advancedAutonomyCheckbox.addEventListener('change', updateAdvancedAutonomyHoldUI);
    }
    if (advancedAutonomyHoldBtn) {
      advancedAutonomyHoldBtn.addEventListener('pointerdown', startAdvancedAutonomyHold);
      advancedAutonomyHoldBtn.addEventListener('pointerup', () => cancelAdvancedAutonomyHold());
      advancedAutonomyHoldBtn.addEventListener('pointercancel', () => cancelAdvancedAutonomyHold());
      advancedAutonomyHoldBtn.addEventListener('mouseleave', () => cancelAdvancedAutonomyHold());
      advancedAutonomyHoldBtn.addEventListener('blur', () => cancelAdvancedAutonomyHold());
    }
    if (advancedAutonomyCloseBtn) {
      advancedAutonomyCloseBtn.addEventListener('click', closeAdvancedAutonomyModal);
    }
    if (extendedPermissionSaveBtn && !extendedPermissionSaveBtn.dataset.bound) {
      extendedPermissionSaveBtn.dataset.bound = 'yes';
      extendedPermissionSaveBtn.addEventListener('click', saveExtendedPermissionModal);
    }
    if (extendedPermissionCloseBtn && !extendedPermissionCloseBtn.dataset.bound) {
      extendedPermissionCloseBtn.dataset.bound = 'yes';
      extendedPermissionCloseBtn.addEventListener('click', closeExtendedPermissionModal);
    }
    if (agentPromptTemplatesBtn && !agentPromptTemplatesBtn.dataset.bound) {
      agentPromptTemplatesBtn.dataset.bound = 'yes';
      agentPromptTemplatesBtn.addEventListener('click', () => {
        const panel = getEl('agentPromptModalTemplatesPanel');
        if (!panel) return;
        panel.classList.toggle('hidden');
      });
    }
    if (agentPromptDeepSeekBtn && !agentPromptDeepSeekBtn.dataset.bound) {
      agentPromptDeepSeekBtn.dataset.bound = 'yes';
      agentPromptDeepSeekBtn.addEventListener('click', refineAgentPromptWithDeepseek);
    }
    if (agentPromptSaveBtn && !agentPromptSaveBtn.dataset.bound) {
      agentPromptSaveBtn.dataset.bound = 'yes';
      agentPromptSaveBtn.addEventListener('click', saveAgentPromptModal);
    }
    if (agentPromptCloseBtn && !agentPromptCloseBtn.dataset.bound) {
      agentPromptCloseBtn.dataset.bound = 'yes';
      agentPromptCloseBtn.addEventListener('click', closeAgentPromptModal);
    }
    if (groupPromptTemplatesBtn && !groupPromptTemplatesBtn.dataset.bound) {
      groupPromptTemplatesBtn.dataset.bound = 'yes';
      groupPromptTemplatesBtn.addEventListener('click', () => {
        const panel = getEl('groupPromptModalTemplatesPanel');
        if (!panel) return;
        panel.classList.toggle('hidden');
      });
    }
    if (groupPromptDeepSeekBtn && !groupPromptDeepSeekBtn.dataset.bound) {
      groupPromptDeepSeekBtn.dataset.bound = 'yes';
      groupPromptDeepSeekBtn.addEventListener('click', refineGroupPromptWithDeepseek);
    }
    if (groupPromptSaveBtn && !groupPromptSaveBtn.dataset.bound) {
      groupPromptSaveBtn.dataset.bound = 'yes';
      groupPromptSaveBtn.addEventListener('click', saveGroupPromptModal);
    }
    if (groupPromptCloseBtn && !groupPromptCloseBtn.dataset.bound) {
      groupPromptCloseBtn.dataset.bound = 'yes';
      groupPromptCloseBtn.addEventListener('click', closeGroupPromptModal);
    }
    const openBtn = getEl('openVirtualAgentsSettingsBtn');
    if (openBtn && !openBtn.dataset.bound) {
      openBtn.dataset.bound = 'yes';
      openBtn.addEventListener('click', openAgentSettings);
    }
    const modalBtn = getEl('openVirtualAgentsSettingsBtnModal');
    if (modalBtn && !modalBtn.dataset.bound) {
      modalBtn.dataset.bound = 'yes';
      modalBtn.addEventListener('click', openAgentSettings);
    }
    updateAdvancedAutonomyHoldUI();
    console.assert(!!getEl('virtualAgentsSettingsRoot'), 'Virtuelle Mitarbeiter Bereich sollte existieren');
    console.assert(!!getEl('virtualAgentsTab'), 'virtualAgentsTab sollte existieren');
  });
})();