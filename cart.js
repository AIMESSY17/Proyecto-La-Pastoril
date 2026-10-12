// Lee el carrito guardado tal cual (solo valida la forma). Los productos se
// comparan con el catálogo recién cuando este termina de cargar (reconcileCart).
export function readStoredCart(storageKey) {
  try {
    const saved = localStorage.getItem(storageKey);
    const storedItems = saved ? JSON.parse(saved) : [];
    if (!Array.isArray(storedItems)) return [];
    return storedItems.flatMap((item) => {
      const quantity = Number(item?.quantity);
      if (typeof item?.id !== 'string' || !Number.isInteger(quantity) || quantity < 1) return [];
      return [{
        id: item.id,
        name: String(item.name || ''),
        price: Number(item.price) || 0,
        quantity: Math.min(quantity, 50),
        image: String(item.image || ''),
      }];
    });
  } catch (error) {
    console.warn('No se pudo cargar el carrito guardado:', error);
    return [];
  }
}

// Compara el carrito con el catálogo vigente: actualiza nombre, precio e imagen
// y saca lo que ya no se vende. Con un catálogo de respaldo (authoritative = false)
// no se borra nada que simplemente no figure, para no perder productos nuevos.
export function reconcileCart(cart, products, authoritative) {
  const removed = [];
  const nextCart = cart.flatMap((item) => {
    const product = products.find((entry) => entry.id === item.id);
    if (!product) {
      if (authoritative) {
        removed.push(item.name || 'Un producto');
        return [];
      }
      return [item];
    }
    if (product.whatsappOnly || product.stockStatus === 'agotado') {
      removed.push(product.name);
      return [];
    }
    return [{ ...item, name: product.name, price: product.price, image: product.image }];
  });
  return { cart: nextCart, removed };
}

export function persistCart(cart, storageKey) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(cart));
  } catch (error) {
    console.warn('No se pudo guardar el carrito:', error);
  }
}
