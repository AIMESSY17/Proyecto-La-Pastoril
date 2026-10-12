export function getFilteredProducts(products, currentFilter, searchText, sortOrder) {
  const search = searchText.trim().toLocaleLowerCase('es-AR');
  const filteredProducts = products.filter((product) => {
    if (currentFilter === 'all') return true;
    if (currentFilter === 'mayor') return product.category === 'mayor';
    // Los packs combinan gallina y codorniz: aparecen en ambos filtros.
    return product.category === currentFilter || product.category === 'pack';
  }).filter((product) => !search || `${product.name} ${product.description}`.toLocaleLowerCase('es-AR').includes(search));

  if (sortOrder === 'default') {
    // Orden elegido por el dueño en el panel (sort_order).
    return filteredProducts.sort((first, second) => (first.sortOrder ?? 0) - (second.sortOrder ?? 0));
  }
  return filteredProducts.sort((first, second) => {
    const difference = first.price - second.price;
    return sortOrder === 'asc' ? difference : -difference;
  });
}
