import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { Registration } from '@/src/types';
import { calculateAge, getAgeRange } from '@/src/lib/storage';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Clock, AlertCircle } from 'lucide-react';

interface DashboardProps {
  data: Registration[];
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];

export function Dashboard({ data }: DashboardProps) {
  // Aggregate data for charts
  const registrationsByBairro = data.reduce((acc, curr) => {
    const bairro = curr.bairro || 'Não Informado';
    acc[bairro] = (acc[bairro] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const bairroData = Object.entries(registrationsByBairro).map(([name, value]) => ({ name, value })).sort((a,b) => b.value - a.value).slice(0, 10);

  const ageData = data.reduce((acc, curr) => {
    if (!curr.dataNascimento) {
      acc['Não Informado'] = (acc['Não Informado'] || 0) + 1;
      return acc;
    }
    const age = calculateAge(curr.dataNascimento);
    const range = getAgeRange(age);
    acc[range] = (acc[range] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const ageCharData = Object.entries(ageData).map(([name, value]) => ({ name, value }));

  const sexData = data.reduce((acc, curr) => {
    const label = curr.sexo === 'M' ? 'Masculino' : curr.sexo === 'F' ? 'Feminino' : (curr.sexo || 'Outro');
    acc[label] = (acc[label] || 0) + 1;

    // Se houver cônjuge, conta o gênero oposto (para M/F)
    if (curr.nome_conjuge) {
      if (curr.sexo === 'M') {
        acc['Feminino'] = (acc['Feminino'] || 0) + 1;
      } else if (curr.sexo === 'F') {
        acc['Masculino'] = (acc['Masculino'] || 0) + 1;
      }
    }
    return acc;
  }, {} as Record<string, number>);

  const sexCharData = Object.entries(sexData).map(([name, value]) => ({ name, value }));

  const responsibleData = data.reduce((acc, curr) => {
    const resp = curr.responsavel || 'Desconhecido';
    acc[resp] = (acc[resp] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const responsibleCharData = Object.entries(responsibleData).map(([name, value]) => ({ name, value }));

  const today = new Date().toISOString().split('T')[0];
  const metrics = data.reduce((acc, reg) => {
    const today = new Date().toISOString().split('T')[0];
    
    // Check main follow-up status
    if (reg.lembrete_contato_ativo && reg.data_proximo_contato) {
      if (reg.data_proximo_contato === today) acc.today++;
      else if (reg.data_proximo_contato < today) acc.late++;
    }

    // Check specific demands status
    if (reg.demands) {
      reg.demands.forEach(d => {
        if (d.atendido && !d.retorno_realizado && d.data_prevista_retorno) {
          if (d.data_prevista_retorno === today) acc.today++;
          else if (d.data_prevista_retorno < today) acc.late++;
        }
      });
    }
    return acc;
  }, { today: 0, late: 0 });

  return (
    <div className="space-y-6">
      {/* Alerts Row */}
      {(metrics.today > 0 || metrics.late > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {metrics.today > 0 && (
            <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-3">
                <div className="bg-amber-100 p-2 rounded-lg text-amber-600">
                  <Clock className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-amber-800 uppercase tracking-tight">Atividades para Hoje</p>
                  <p className="text-xs text-amber-600">Você tem {metrics.today} tarefa(s) programada(s) para hoje.</p>
                </div>
              </div>
              <div className="text-xl font-bold text-amber-700">{metrics.today}</div>
            </div>
          )}
          {metrics.late > 0 && (
            <div className="bg-red-50 border border-red-200 p-4 rounded-xl flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-3">
                <div className="bg-red-100 p-2 rounded-lg text-red-600">
                  <AlertCircle className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-red-800 uppercase tracking-tight">Pendências Atrasadas</p>
                  <p className="text-xs text-red-600">Total de {metrics.late} itens com prazo expirado!</p>
                </div>
              </div>
              <div className="text-xl font-bold text-red-700">{metrics.late}</div>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {/* Metric Cards Summary */}
      <Card className="lg:col-span-1">
        <CardHeader>
          <CardTitle>Total de Registros</CardTitle>
          <CardDescription>Quantidade acumulada de cadastros</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-4xl font-bold text-blue-600">{data.length}</div>
          <p className="text-xs text-slate-500 mt-1">Plataforma em tempo real</p>
        </CardContent>
      </Card>

      <Card className="lg:col-span-1">
        <CardHeader>
          <CardTitle>Cidade Dominante</CardTitle>
          <CardDescription>Local com maior número de cadastros</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-slate-800">
            {Object.entries(data.reduce((acc, curr) => {
              const cidade = curr.cidade || 'N/A';
              acc[cidade] = (acc[cidade] || 0) + 1;
              return acc;
            }, {} as Record<string, number>)).sort((a,b) => b[1] - a[1])[0]?.[0] || 'N/A'}
          </div>
          <p className="text-xs text-slate-500 mt-1">Baseado na localização do CEP</p>
        </CardContent>
      </Card>

      <Card className="lg:col-span-1">
        <CardHeader>
          <CardTitle>Média de Idade</CardTitle>
          <CardDescription>Perfil etário dos eleitores</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-blue-600">
            {Math.round(data.reduce((acc, curr) => acc + (curr.dataNascimento ? calculateAge(curr.dataNascimento) : 0), 0) / (data.filter(d => d.dataNascimento).length || 1))} anos
          </div>
          <p className="text-xs text-slate-500 mt-1">Média ponderada</p>
        </CardContent>
      </Card>

      {/* Charts */}
      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle>Distribuição por Bairro</CardTitle>
          <CardDescription>Top 10 bairros com mais cadastros</CardDescription>
        </CardHeader>
        <CardContent className="h-[250px] md:h-[300px] px-0 md:px-6">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={bairroData} margin={{ top: 10, right: 10, left: 10, bottom: 60 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis 
                dataKey="name" 
                fontSize={9} 
                tickLine={false} 
                axisLine={false} 
                interval={0}
                angle={-45}
                textAnchor="end"
                height={80}
              />
              <YAxis fontSize={10} tickLine={false} axisLine={false} />
              <Tooltip 
                contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '12px' }}
                cursor={{ fill: '#f8fafc' }}
              />
              <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card className="md:col-span-1">
        <CardHeader>
          <CardTitle>Faixa Etária</CardTitle>
          <CardDescription>Perfil demográfico por idade</CardDescription>
        </CardHeader>
        <CardContent className="h-[250px] md:h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={ageCharData}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={70}
                paddingAngle={5}
                dataKey="value"
              >
                {ageCharData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ fontSize: '12px', borderRadius: '8px' }} />
              <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: '10px' }}/>
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card className="md:col-span-1">
        <CardHeader>
          <CardTitle>Distribuição por Sexo</CardTitle>
          <CardDescription>Proporção de gênero na base</CardDescription>
        </CardHeader>
        <CardContent className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={sexCharData}
                cx="50%"
                cy="45%"
                outerRadius={65}
                fill="#8884d8"
                dataKey="value"
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                labelLine={true}
              >
                {sexCharData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[(index + 2) % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card className="md:col-span-2 shadow-sm">
        <CardHeader>
          <CardTitle>Desempenho por Responsável</CardTitle>
          <CardDescription>Cadastros realizados por agente</CardDescription>
        </CardHeader>
        <CardContent className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={responsibleCharData} margin={{ top: 10, right: 10, left: 10, bottom: 50 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis 
                dataKey="name" 
                fontSize={10} 
                tickLine={false} 
                axisLine={false}
                interval={0}
                angle={-30}
                textAnchor="end"
                height={60}
              />
              <YAxis fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip />
              <Bar dataKey="value" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  </div>
  );
}
