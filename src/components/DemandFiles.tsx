import React, { useState, useRef } from 'react';
import { DemandFile } from '../types';
import { 
  Paperclip, 
  Trash2, 
  Download, 
  FileText, 
  File, 
  FileSpreadsheet, 
  FileImage,
  Plus,
  AlertCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface DemandFilesProps {
  files?: DemandFile[];
  onChange: (updatedFiles: DemandFile[]) => void;
  readOnly?: boolean;
}

export const DemandFiles: React.FC<DemandFilesProps> = ({ 
  files = [], 
  onChange, 
  readOnly = false 
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Helper to format file size
  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  // Helper to pick attachment icon
  const getFileIcon = (fileName: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'pdf':
        return <FileText className="h-5 w-5 text-red-500 shrink-0" />;
      case 'doc':
      case 'docx':
        return <FileText className="h-5 w-5 text-blue-500 shrink-0" />;
      case 'xls':
      case 'xlsx':
      case 'csv':
        return <FileSpreadsheet className="h-5 w-5 text-emerald-500 shrink-0" />;
      case 'png':
      case 'jpg':
      case 'jpeg':
      case 'gif':
      case 'webp':
        return <FileImage className="h-5 w-5 text-purple-500 shrink-0" />;
      default:
        return <File className="h-5 w-5 text-slate-500 shrink-0" />;
    }
  };

  // Read file and convert to Base64
  const processFiles = (fileList: FileList) => {
    const MAX_SIZE_MB = 4; // 4MB safe limit for DB sync + local storage
    const acceptedFiles: File[] = [];

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      if (file.size > MAX_SIZE_MB * 1024 * 1024) {
        toast.error(`O arquivo "${file.name}" excede o limite permitido de ${MAX_SIZE_MB}MB.`);
        continue;
      }
      acceptedFiles.push(file);
    }

    if (acceptedFiles.length === 0) return;

    let loadedCount = 0;
    const newFiles: DemandFile[] = [];

    acceptedFiles.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64Data = e.target?.result as string;
        if (base64Data) {
          const newFile: DemandFile = {
            id: Math.random().toString(36).substring(2, 9),
            name: file.name,
            type: file.type,
            size: file.size,
            data: base64Data,
            uploaded_at: new Date().toISOString()
          };
          newFiles.push(newFile);
        }
        loadedCount++;
        if (loadedCount === acceptedFiles.length) {
          onChange([...files, ...newFiles]);
          toast.success(`${newFiles.length} arquivo(s) adicionador(es) com sucesso.`);
        }
      };
      reader.onerror = () => {
        toast.error(`Falha ao ler o arquivo: ${file.name}`);
        loadedCount++;
      };
      reader.readAsDataURL(file);
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!readOnly) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (!readOnly && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  };

  const handleDelete = (id: string, name: string) => {
    onChange(files.filter(f => f.id !== id));
    toast.success(`Arquivo "${name}" removido.`);
  };

  const handleDownload = (file: DemandFile) => {
    try {
      const link = document.createElement('a');
      link.href = file.data;
      link.download = file.name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e) {
      toast.error('Erro ao realizar o download deste arquivo.');
    }
  };

  return (
    <div id="demand-files-container" className="space-y-3">
      {/* Listagem de arquivos existentes */}
      {files.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {files.map((file) => (
            <div 
              key={file.id} 
              className="flex items-center justify-between p-2.5 rounded-xl border border-slate-100 bg-white shadow-xs group hover:border-slate-300 transition-all"
            >
              <div 
                className="flex items-center gap-2.5 min-w-0 cursor-pointer flex-1" 
                onClick={() => handleDownload(file)}
                title="Clique para baixar"
              >
                {getFileIcon(file.name)}
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-slate-700 truncate group-hover:text-blue-600 transition-colors">
                    {file.name}
                  </p>
                  <p className="text-[10px] text-slate-400 font-medium">
                    {formatSize(file.size)}
                  </p>
                </div>
              </div>

              <div className="flex gap-1 shrink-0 ml-2">
                <Button
                  id={`download-file-${file.id}`}
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-slate-400 hover:text-blue-600 hover:bg-blue-50"
                  onClick={() => handleDownload(file)}
                  title="Baixar arquivo"
                >
                  <Download className="h-3.5 w-3.5" />
                </Button>
                {!readOnly && (
                  <Button
                    id={`delete-file-${file.id}`}
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-slate-400 hover:text-red-500 hover:bg-red-50"
                    onClick={() => handleDelete(file.id, file.name)}
                    title="Excluir arquivo"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Dropzone de Upload */}
      {!readOnly && (
        <div
          id="dropzone-area"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border border-dashed rounded-xl p-3 text-center cursor-pointer flex flex-col items-center justify-center gap-1.5 transition-all outline-none ${
            isDragging 
              ? 'border-blue-500 bg-blue-50/40 scale-[0.99]' 
              : 'border-slate-200 hover:border-blue-400 hover:bg-slate-50/50 bg-slate-50/30'
          }`}
        >
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileChange} 
            className="hidden" 
            multiple 
            accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.png,.jpg,.jpeg,.gif,.txt"
          />
          <div className="flex items-center gap-1.5 justify-center text-slate-500 hover:text-blue-600">
            <Plus className="h-4 w-4 text-slate-400 shrink-0" />
            <span className="text-xs font-bold">Anexar Documentos</span>
          </div>
          <p className="text-[10px] text-slate-400">
            PDF, Word, Excel ou imagens de até 4MB (Arraste ou clique)
          </p>
        </div>
      )}
    </div>
  );
};
