export interface OrderItem {
  id?: number;
  orderId?: number;
  productName: string;
  quantity: number;
  unitPrice: number;
}

export interface Order {
  id?: number;
  customerName: string;
  customerEmail: string;
  status: 'pending' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled';
  items: OrderItem[];
  totalAmount?: number;
  createdAt?: Date;
  updatedAt?: Date;
}
