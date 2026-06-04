import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from 'lucide-react';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'info' | 'warning';
  loading?: boolean;
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  variant = 'danger',
  loading = false,
}: ConfirmDialogProps) {
  const getVariantStyles = () => {
    switch (variant) {
      case 'danger':
        return 'bg-red-600 hover:bg-red-700 text-white';
      case 'warning':
        return 'bg-yellow-600 hover:bg-yellow-700 text-white';
      case 'info':
        return 'bg-blue-600 hover:bg-blue-700 text-white';
      default:
        return '';
    }
  };

  const getIcon = () => {
    switch (variant) {
      case 'danger':
        return <AlertTriangle className="h-6 w-6 text-red-600" />;
      case 'warning':
        return <AlertTriangle className="h-6 w-6 text-yellow-600" />;
      case 'info':
        return <AlertTriangle className="h-6 w-6 text-blue-600" />;
      default:
        return null;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[400px] p-0 overflow-hidden border-0 shadow-2xl">
        <div className="p-6">
          <div className="flex gap-4 items-start">
            <div className={`p-3 rounded-full flex-shrink-0 ${variant === 'danger' ? 'bg-red-50' : variant === 'warning' ? 'bg-yellow-50' : 'bg-blue-50'}`}>
              {getIcon()}
            </div>
            <div className="space-y-1">
              <DialogHeader className="text-left p-0">
                <DialogTitle className="text-lg text-slate-900 font-bold leading-tight">
                  {title}
                </DialogTitle>
                <DialogDescription className="text-slate-500 text-sm py-2">
                  {description}
                </DialogDescription>
              </DialogHeader>
            </div>
          </div>
        </div>
        
        <DialogFooter className="bg-slate-50 p-4 gap-3 sm:gap-0">
          <Button 
            variant="ghost" 
            onClick={onClose}
            className="flex-1 sm:flex-none text-slate-500 hover:bg-slate-100"
            disabled={loading}
          >
            {cancelLabel}
          </Button>
          <Button 
            onClick={onConfirm}
            className={`flex-1 sm:flex-none font-bold ${getVariantStyles()}`}
            disabled={loading}
          >
            {loading ? 'Processando...' : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
