// V4.4.1 migration boundary: Company OS owns operative approval. Until a
// validated server-to-server consume protocol is activated, independent Seller
// Tool draft writers are unavailable. No client flag or env setting bypasses it.
export function assertSellerDraftTransportActivated(){
 throw Object.assign(Error('Operative Entwurfserstellung wartet auf die revisionsgebundene Company-OS-Freigabe.'),{code:'v441_transport_activation_blocked',status:409});
}

// A draft approval can never authorize publication or its preparatory offer PUT.
export function assertSellerPublicationActivated(){
 throw Object.assign(Error('Veröffentlichung und Angebotsänderung benötigen eine gesonderte revisionsgebundene Freigabe.'),{code:'v441_publication_activation_blocked',status:409});
}
