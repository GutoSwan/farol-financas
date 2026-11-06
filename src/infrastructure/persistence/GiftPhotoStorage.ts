/** Fotos locais ficam fora do localStorage para não esgotar o limite dos registros financeiros. */
const DB_NAME = 'farol-financas-gift-photos-v1'
const STORE = 'photos'
export const MAX_GIFT_PHOTO_BYTES = 8 * 1024 * 1024

export function validateGiftPhoto(file: Blob): void {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    throw new Error('Escolha uma foto PNG, JPG ou WebP.')
  }
  if (file.size === 0 || file.size > MAX_GIFT_PHOTO_BYTES) {
    throw new Error('A imagem deve ter até 8 MB e não pode estar vazia.')
  }
}

function database(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('Este navegador não permite armazenar fotos locais.'))
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(new Error('Não foi possível abrir o armazenamento das fotos.'))
    request.onblocked = () => reject(new Error('Feche outras abas do Farol e tente novamente.'))
  })
}

function photoOperation<T>(id: string, mode: IDBTransactionMode,
  operation: (store: IDBObjectStore, resolve: (value: T) => void) => void): Promise<T> {
  return database().then((db) => new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(STORE, mode)
    const store = transaction.objectStore(STORE)
    transaction.onerror = () => reject(new Error('Não foi possível acessar a foto deste presente.'))
    transaction.onabort = () => reject(new Error('A operação com a foto não foi concluída.'))
    transaction.oncomplete = () => db.close()
    try { operation(store, resolve) } catch (cause) { db.close(); reject(cause) }
  }))
}

export function getGiftPhoto(id: string): Promise<Blob | null> {
  return photoOperation(id, 'readonly', (store, resolve) => {
    const request = store.get(id)
    request.onsuccess = () => resolve(request.result instanceof Blob ? request.result : null)
  })
}

export function saveGiftPhoto(id: string, image: Blob): Promise<void> {
  validateGiftPhoto(image)
  return photoOperation(id, 'readwrite', (store, resolve) => {
    const request = store.put(image, id)
    // A escrita só foi efetivada quando a transação concluir.
    request.onsuccess = () => { /* a transação ainda pode falhar */ }
    store.transaction.oncomplete = () => { store.transaction.db.close(); resolve() }
  })
}

export function deleteGiftPhoto(id: string): Promise<void> {
  return photoOperation(id, 'readwrite', (store, resolve) => {
    store.delete(id)
    store.transaction.oncomplete = () => { store.transaction.db.close(); resolve() }
  })
}
