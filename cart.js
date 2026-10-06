export function restoreCart(products, storageKey) {
  try {
    const saved = localStorage.getItem(storageKey);
    const storedItems = saved ? JSON.parse(saved) : [];
    if (!Array.isArray(storedItems)) return [];
    return storedItems.flatMap((item) => {
      const product = products.find((entry) => entry.id === item?.id);
      const quantity = Number(item?.quantity);
      if (!product || product.whatsappOnly || !Number.isInteger(quantity) || quantity < 1) return [];
      return [{
        id: product.id,
        name: product.name,
        price: product.price,
        quantity,
        image: product.image,
      }];
    });
  } catch (error) {
    console.warn('No se pudo cargar el carrito guardado:', error);
    return [];
  }
}

export function persistCart(cart, storageKey) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(cart));
  } catch (error) {
    console.warn('No se pudo guardar el carrito:', error);
  }
}
