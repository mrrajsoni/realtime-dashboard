import { ReactNode } from 'react';

interface IMetricCardProps {
  title: string;
  value: number;
  children?: ReactNode;
}
const MetricCard = ({ title, value, children }: IMetricCardProps) => {
  return (
    <section>
      <div>{title} </div>
      <div>{value}</div>
      <div>{children} </div>
    </section>
  );
};

export default MetricCard;
