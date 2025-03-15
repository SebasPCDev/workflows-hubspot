// test.js
const { main } = require("./customCode");

//Usuario con negocios asociados 97523883380
// Usuario sin negocios asociados 105096851214

// Simulación del objeto event que HubSpot envía
const event = {
  inputFields: {
    id: "106309260213",
  },
};

// Ejecuta la función main y muestra el resultado en consola
main(event);
