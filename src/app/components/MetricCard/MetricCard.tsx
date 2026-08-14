import {Card, CardDescription, CardHeader, CardTitle} from '@/components/ui/card';
import {ReactNode} from 'react';

interface IMetricCardProps {
  title: string;
  children?: ReactNode;
}
const MetricCard = ({title, children}: IMetricCardProps) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription> {children}</CardDescription>
      </CardHeader>
    </Card>
  );
};

export default MetricCard;
