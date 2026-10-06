export function getFilteredProducts(products, currentFilter, searchText, sortOrder) {
  const search = searchText.trim().toLocaleLowerCase('es-AR');
  const filteredProducts = products.filter((product) => {
    if (currentFilter === 'all') return true;
    if (currentFilter === 'mayor') return product.category === 'mayor';
    return product.category === currentFilter || product.id === 'pack-familiar' || product.id === 'degustacion';
  }).filter((product) => !search || `${product.name} ${product.description}`.toLocaleLowerCase('es-AR').includes(search));

  if (sortOrder === 'default') {
    return filteredProducts.sort((first, second) => Number(second.id === 'pack-familiar') - Number(first.id === 'pack-familiar'));
  }
  return filteredProducts.sort((first, second) => {
    const difference = first.price - second.price;
    return sortOrder === 'asc' ? difference : -difference;
  });
}
