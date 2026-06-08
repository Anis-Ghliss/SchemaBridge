export const sampleSource = {
  customerName: "John",
  customerEmail: "john@example.com",
  shippingCity: "Tunis",
  plan: "pro"
};

export const sampleTarget = {
  customer: {
    name: "John",
    email: "john@example.com",
    address: {
      city: "Tunis"
    }
  },
  subscription: {
    tier: "pro",
    status: "active"
  }
};
