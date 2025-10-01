import { useEffect, useState } from 'react';
import { Progress } from '@/components/ui/progress';

export function StorageMeter({
  used,
  quota = 1073741824,
  onUpgrade
}: {
  used: number;
  quota?: number;
  onUpgrade: () => void;
}) {
  const [percentage, setPercentage] = useState(0);
  const [isCritical, setIsCritical] = useState(false);

  useEffect(() => {
    const newPercentage = Math.min(100, (used / quota) * 100);
    setPercentage(newPercentage);
    setIsCritical(newPercentage > 90);
  }, [used, quota]);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <span>{formatBytes(used)} of {formatBytes(quota)} used</span>
        <span>{percentage.toFixed(1)}%</span>
      </div>
      <Progress value={percentage} className={isCritical ? 'bg-red-500' : ''} />
      {isCritical && (
        <div className="flex justify-between items-center">
          <span className="text-sm text-red-500">Storage nearly full</span>
          <button 
            onClick={onUpgrade}
            className="text-sm bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded"
          >
            Upgrade Storage
          </button>
        </div>
      )}
    </div>
  );
}