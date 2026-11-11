/** Modèles de dossiers par type de sinistre et étapes types réutilisables. */

export const DOSSIER_TEMPLATES = [
  {
    id: 'DDE',
    name: 'Dégât des eaux',
    object: 'Dégât des eaux : infiltration / fuite avec dommages aux biens immobiliers et mobiliers.',
    steps: [
      { category: 'SINISTRE', fact: "Découverte du sinistre : [décrire la trace, l'écoulement, la zone touchée et la surface approximative].", actor: 'Assuré', impact: 'Dommages constatés', pjName: 'Photos-datees' },
      { category: 'TECHNIQUE', fact: "Mesure conservatoire : coupure de l'arrivée d'eau, épongeage, protection du mobilier.", actor: 'Assuré', impact: 'Limitation du dommage' },
      { category: 'TECHNIQUE', fact: 'Recherche de fuite non destructive réalisée. Conclusion du rapport : [origine de la fuite].', actor: 'Entreprise de recherche de fuite', pjName: 'Rapport-recherche-de-fuite' },
      { category: 'ADMIN', fact: "Déclaration du sinistre à l'assureur et transmission du constat amiable dégât des eaux.", actor: 'Assuré', pjName: 'Constat-amiable-DDE' },
      { category: 'ADMIN', fact: 'Transmission du devis de remise en état (assèchement, traitement, peinture).', actor: 'Entreprise de travaux', pjName: 'Devis-remise-en-etat' }
    ]
  },
  {
    id: 'INCENDIE',
    name: 'Incendie / Fumées',
    object: 'Incendie : dommages par le feu, la chaleur et les fumées.',
    steps: [
      { category: 'SINISTRE', fact: 'Départ de feu constaté : [origine, pièce, heure].', actor: 'Assuré', impact: 'Dommages feu et fumées' },
      { category: 'TECHNIQUE', fact: "Intervention des services de secours — rapport d'intervention demandé.", actor: 'Pompiers', pjName: 'Rapport-intervention-pompiers' },
      { category: 'ADMIN', fact: "Déclaration du sinistre à l'assureur avec inventaire provisoire des biens détruits.", actor: 'Assuré', pjName: 'Inventaire-biens-detruits' },
      { category: 'TECHNIQUE', fact: 'Mesures conservatoires : sécurisation, bâchage, nettoyage des suies.', actor: 'Entreprise' },
      { category: 'ADMIN', fact: "Passage de l'expert mandaté par l'assureur.", actor: 'Expert assureur', pjName: 'Compte-rendu-expertise' }
    ]
  },
  {
    id: 'VOL',
    name: 'Vol / Vandalisme',
    object: 'Vol par effraction : disparition de biens et dégradations des accès.',
    steps: [
      { category: 'SINISTRE', fact: "Découverte de l'effraction et du vol : [point d'entrée, dégradations, biens manquants].", actor: 'Assuré', pjName: 'Photos-effraction' },
      { category: 'ADMIN', fact: 'Dépôt de plainte au commissariat / à la gendarmerie.', actor: 'Assuré', pjName: 'Depot-de-plainte' },
      { category: 'TECHNIQUE', fact: "Sécurisation en urgence de l'ouvrant fracturé.", actor: 'Serrurier', pjName: 'Facture-serrurier' },
      { category: 'ADMIN', fact: "Déclaration du vol à l'assureur avec état estimatif des biens volés et justificatifs d'achat.", actor: 'Assuré', pjName: 'Etat-estimatif-et-factures' }
    ]
  },
  {
    id: 'AUTO',
    name: 'Automobile',
    object: 'Sinistre automobile : collision avec dommages matériels.',
    steps: [
      { category: 'SINISTRE', fact: 'Accident / collision : [lieu, circonstances, véhicules impliqués].', actor: 'Assuré', pjName: 'Photos-vehicule' },
      { category: 'ADMIN', fact: 'Constat amiable rempli et signé par les deux parties.', actor: 'Assuré & tiers', pjName: 'Constat-amiable-auto' },
      { category: 'ADMIN', fact: "Déclaration du sinistre à l'assureur.", actor: 'Assuré' },
      { category: 'TECHNIQUE', fact: 'Devis de réparation établi par le garage.', actor: 'Garage', pjName: 'Devis-reparation' },
      { category: 'ADMIN', fact: 'Expertise du véhicule.', actor: 'Expert auto', pjName: 'Rapport-expertise-auto' }
    ]
  },
  { id: 'VIDE', name: 'Dossier vierge', object: '', steps: [] }
]

export const STEP_PRESETS = [
  { category: 'BLOCAGE', channel: 'LRAR', fact: 'Relance écrite adressée au gestionnaire — absence de réponse depuis [X] jours sur [objet].', actor: 'Assuré', impact: "Dossier à l'arrêt", question: 'Pouvez-vous m’indiquer sous quel délai une décision de prise en charge sera rendue ?' },
  { category: 'BLOCAGE', channel: 'TEL', fact: 'Relance téléphonique — interlocuteur : [nom]. Engagement annoncé : [réponse obtenue].', actor: 'Assuré' },
  { category: 'ADMIN', fact: "Transmission des pièces complémentaires demandées par l'assureur : [liste].", actor: 'Assuré' },
  { category: 'ADMIN', fact: "Réception du courrier / mail de l'assureur : [contenu de la position prise].", actor: 'Assureur', pjName: 'Courrier-assureur' },
  { category: 'ADMIN', channel: 'REUNION', fact: "Passage de l'expert mandaté par l'assureur. Points relevés : [observations].", actor: 'Expert assureur', pjName: 'Compte-rendu-expertise' },
  { category: 'TECHNIQUE', fact: "Intervention d'urgence / mesure conservatoire : [nature des travaux].", actor: 'Entreprise' },
  { category: 'ADMIN', fact: 'Réception du devis / de la facture : [prestation].', actor: 'Entreprise', pjName: 'Devis-ou-facture' },
  { category: 'ECHEANCE', channel: 'REUNION', fact: 'Rendez-vous à venir : [objet du rendez-vous].', actor: 'À confirmer' },
  { category: 'ADMIN', fact: "Réception de la proposition d'indemnisation : [montant et mode de calcul].", actor: 'Assureur', pjName: 'Proposition-indemnisation', question: 'Pouvez-vous me détailler le calcul de la vétusté appliquée et la franchise retenue ?' },
  { category: 'BLOCAGE', fact: 'Désaccord notifié sur [point] : [motif factuel du désaccord].', actor: 'Assuré', impact: "Point d'arbitrage ouvert" }
]
