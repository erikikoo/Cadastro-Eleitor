import React, { useMemo, useState } from 'react';
import { Registration } from '@/src/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { 
  Users, 
  UserPlus, 
  Baby, 
  Heart, 
  MapPin, 
  TrendingUp,
  BarChart3,
  Filter,
  Search,
  XCircle
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

interface AdvancedAnalysisProps {
  data: Registration[];
}

export function AdvancedAnalysis({ data }: AdvancedAnalysisProps) {
  const [filters, setFilters] = useState({
    bairro: '',
    sexo: '',
    childSex: '',
    minChildren: '0'
  });

  const filteredData = useMemo(() => {
    return data.filter(reg => {
      const matchesBairro = !filters.bairro || (reg.bairro?.toLowerCase() || '').includes(filters.bairro.toLowerCase());
      const matchesSexo = !filters.sexo || reg.sexo === filters.sexo;
      
      const children = reg.filhos || [];
      const matchesChildSex = !filters.childSex || children.some(c => c.sexo === filters.childSex);
      const matchesChildren = children.length >= parseInt(filters.minChildren);

      return matchesBairro && matchesSexo && matchesChildren && matchesChildSex;
    });
  }, [data, filters]);

  const stats = useMemo(() => {
    let totalWomen = 0;
    let womenWithKids = 0;
    let totalMen = 0;
    let menWithKids = 0;
    let totalOthersProfile = 0;
    let othersWithKids = 0;
    let totalChildren = 0;
    let totalBoys = 0;
    let totalGirls = 0;
    let totalOthers = 0;

    const ageRanges: Record<string, number> = {
      '0-3 anos': 0,
      '4-6 anos': 0,
      '7-12 anos': 0,
      '13-17 anos': 0,
      '18+ anos': 0
    };

    const bairroStats: Record<string, {
      name: string;
      mothers: number;
      fathers: number;
      othersProfile: number;
      boys: number;
      girls: number;
      others: number;
      totalChildren: number;
      totalFamilies: number;
    }> = {};

    const calculateAge = (birthDate: string) => {
      if (!birthDate) return -1;
      const birth = new Date(birthDate);
      const today = new Date();
      let age = today.getFullYear() - birth.getFullYear();
      const m = today.getMonth() - birth.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
        age--;
      }
      return age;
    };

    filteredData.forEach(reg => {
      const bairro = reg.bairro || 'Não Informado';
      if (!bairroStats[bairro]) {
        bairroStats[bairro] = {
          name: bairro,
          mothers: 0,
          fathers: 0,
          othersProfile: 0,
          boys: 0,
          girls: 0,
          others: 0,
          totalChildren: 0,
          totalFamilies: 0
        };
      }

      const children = reg.filhos || [];
      const hasChildren = children.length > 0;
      const hasSpouse = !!reg.nome_conjuge;

      // Logic: Registrant + Spouse (if exists)
      if (reg.sexo === 'F') {
        // Registrant is Woman
        totalWomen++;
        if (hasChildren) {
          womenWithKids++;
          bairroStats[bairro].mothers++;
        }
        
        // Spouse is Man
        if (hasSpouse) {
          totalMen++;
          if (hasChildren) {
            menWithKids++;
            bairroStats[bairro].fathers++;
          }
        }
      } else if (reg.sexo === 'M') {
        // Registrant is Man
        totalMen++;
        if (hasChildren) {
          menWithKids++;
          bairroStats[bairro].fathers++;
        }
        
        // Spouse is Woman
        if (hasSpouse) {
          totalWomen++;
          if (hasChildren) {
            womenWithKids++;
            bairroStats[bairro].mothers++;
          }
        }
      } else {
        // Registrant is "Prefiro não dizer" or Other
        totalOthersProfile++;
        if (hasChildren) {
          othersWithKids++;
          bairroStats[bairro].othersProfile++;
        }
      }

      if (hasChildren) {
        bairroStats[bairro].totalFamilies++;
        children.forEach(child => {
          if (!filters.childSex || child.sexo === filters.childSex) {
            totalChildren++;
            bairroStats[bairro].totalChildren++;
            
            if (child.sexo === 'M') {
              totalBoys++;
              bairroStats[bairro].boys++;
            } else if (child.sexo === 'F') {
              totalGirls++;
              bairroStats[bairro].girls++;
            } else {
              totalOthers++;
              bairroStats[bairro].others++;
            }

            const age = calculateAge(child.dataNascimento);
            if (age >= 0 && age <= 3) ageRanges['0-3 anos']++;
            else if (age >= 4 && age <= 6) ageRanges['4-6 anos']++;
            else if (age >= 7 && age <= 12) ageRanges['7-12 anos']++;
            else if (age >= 13 && age <= 17) ageRanges['13-17 anos']++;
            else if (age >= 18) ageRanges['18+ anos']++;
          }
        });
      }
    });

    return {
      totals: { 
        totalWomen, 
        womenWithKids, 
        totalMen, 
        menWithKids, 
        totalOthersProfile,
        othersWithKids,
        totalChildren, 
        totalBoys, 
        totalGirls,
        totalOthers,
        totalParents: womenWithKids + menWithKids + othersWithKids
      },
      ageRanges: Object.entries(ageRanges).map(([name, value]) => ({ name, value })),
      byBairro: Object.values(bairroStats).sort((a, b) => b.totalChildren - a.totalChildren)
    };
  }, [filteredData, filters.childSex]);

  const topBairrosChart = stats.byBairro.slice(0, 8);
  const ageRangeChart = stats.ageRanges;

  const resetFilters = () => setFilters({ bairro: '', sexo: '', childSex: '', minChildren: '0' });

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10">
      {/* Search & Filters */}
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
        <div className="md:col-span-1">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Filtrar Bairro</label>
          <div className="relative">
            <Input 
              placeholder="Digite o bairro..." 
              value={filters.bairro}
              onChange={(e) => setFilters({ ...filters, bairro: e.target.value })}
              className="pl-9 h-11 bg-slate-50 border-slate-200"
            />
            <Search className="h-4 w-4 absolute left-3 top-3.5 text-slate-400" />
          </div>
        </div>

        <div>
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Sexo (Pai/Mãe)</label>
          <select 
            className="w-full h-11 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium"
            value={filters.sexo}
            onChange={(e) => setFilters({ ...filters, sexo: e.target.value })}
          >
            <option value="">Todos</option>
            <option value="F">Feminino</option>
            <option value="M">Masculino</option>
          </select>
        </div>

        <div>
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Sexo do Filho</label>
          <select 
            className="w-full h-11 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium"
            value={filters.childSex}
            onChange={(e) => setFilters({ ...filters, childSex: e.target.value })}
          >
            <option value="">Todos</option>
            <option value="M">Meninos</option>
            <option value="F">Meninas</option>
            <option value="Prefiro não dizer">Outros / Não Informado</option>
          </select>
        </div>

        <div>
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Mínimo de Filhos</label>
          <select 
            className="w-full h-11 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium"
            value={filters.minChildren}
            onChange={(e) => setFilters({ ...filters, minChildren: e.target.value })}
          >
            <option value="0">Qualquer</option>
            <option value="1">1+ Filho</option>
            <option value="2">2+ Filhos</option>
            <option value="3">3+ Filhos</option>
          </select>
        </div>

        <div className="flex gap-2">
          <button 
            onClick={resetFilters}
            className="h-11 px-4 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all flex-1"
          >
            <XCircle className="h-4 w-4" />
            Limpar
          </button>
        </div>
      </div>
      {/* Summary Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Mulheres */}
        <Card className="border-pink-100 shadow-sm overflow-hidden group">
          <div className="h-1 bg-pink-500 w-full" />
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-black text-pink-600 uppercase tracking-widest flex items-center gap-2">
              <Heart className="h-4 w-4" />
              Perfil Feminino
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase">Total Cadastradas</p>
                <div className="text-3xl font-black text-slate-800">{stats.totals.totalWomen}</div>
              </div>
              <div className="border-l border-slate-100 pl-4">
                <p className="text-[10px] text-pink-500 font-bold uppercase">Mães (com filhos)</p>
                <div className="text-3xl font-black text-pink-600">{stats.totals.womenWithKids}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Homens */}
        <Card className="border-blue-100 shadow-sm overflow-hidden">
          <div className="h-1 bg-blue-500 w-full" />
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-black text-blue-600 uppercase tracking-widest flex items-center gap-2">
              <Users className="h-4 w-4" />
              Perfil Masculino
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase">Total Cadastrados</p>
                <div className="text-3xl font-black text-slate-800">{stats.totals.totalMen}</div>
              </div>
              <div className="border-l border-slate-100 pl-4">
                <p className="text-[10px] text-blue-500 font-bold uppercase">Pais (com filhos)</p>
                <div className="text-3xl font-black text-blue-600">{stats.totals.menWithKids}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Crianças */}
        <Card className="border-slate-100 shadow-sm overflow-hidden">
          <div className="h-1 bg-slate-400 w-full" />
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
              <Users className="h-4 w-4" />
              Perfil Outros / Não Inf.
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase">Total Cadastrados</p>
                <div className="text-3xl font-black text-slate-800">{stats.totals.totalOthersProfile}</div>
              </div>
              <div className="border-l border-slate-100 pl-4">
                <p className="text-[10px] text-slate-500 font-bold uppercase">Famílias (com filhos)</p>
                <div className="text-3xl font-black text-slate-600">{stats.totals.othersWithKids}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Crianças */}
        <Card className="border-emerald-100 shadow-sm overflow-hidden md:col-span-2 lg:col-span-3">
          <div className="h-1 bg-emerald-500 w-full" />
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-black text-emerald-600 uppercase tracking-widest flex items-center gap-2">
              <Baby className="h-4 w-4" />
              Métricas de Filhos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end justify-between">
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase">Total Filhos</p>
                <div className="text-3xl font-black text-emerald-600">{stats.totals.totalChildren}</div>
              </div>
              <div className="flex gap-3 mb-1">
                <div className="text-center">
                  <div className="text-[9px] font-bold text-blue-500 uppercase">Meninos</div>
                  <div className="text-sm font-black text-slate-700">{stats.totals.totalBoys}</div>
                </div>
                <div className="text-center">
                  <div className="text-[9px] font-bold text-pink-500 uppercase">Meninas</div>
                  <div className="text-sm font-black text-slate-700">{stats.totals.totalGirls}</div>
                </div>
                <div className="text-center">
                  <div className="text-[9px] font-bold text-slate-400 uppercase">Outros</div>
                  <div className="text-sm font-black text-slate-700">{stats.totals.totalOthers}</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart Card */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-blue-600" />
              Concentração por Bairro
            </CardTitle>
            <CardDescription>Distribuição de crianças por localidade</CardDescription>
          </CardHeader>
          <CardContent className="h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topBairrosChart} layout="vertical" margin={{ left: 20, right: 40, top: 10, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9" />
                <XAxis type="number" fontSize={11} hide />
                <YAxis 
                  dataKey="name" 
                  type="category" 
                  fontSize={11} 
                  tickLine={false} 
                  axisLine={false}
                  width={150}
                  className="font-bold text-slate-700"
                />
                <Tooltip 
                  cursor={{ fill: '#f8fafc' }}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '11px', paddingTop: '20px' }} />
                <Bar name="Meninos" dataKey="boys" stackId="a" fill="#3b82f6" radius={[0, 0, 0, 0]} />
                <Bar name="Meninas" dataKey="girls" stackId="a" fill="#ec4899" radius={[0, 0, 0, 0]} />
                <Bar name="Outros" dataKey="others" stackId="a" fill="#94a3b8" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Age Range Chart */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-emerald-600" />
              Faixa Etária das Crianças
            </CardTitle>
            <CardDescription>Distribuição por idade cronológica</CardDescription>
          </CardHeader>
          <CardContent className="h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ageRangeChart} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" fontSize={11} axisLine={false} tickLine={false} />
                <YAxis fontSize={11} axisLine={false} tickLine={false} />
                <Tooltip 
                  cursor={{ fill: '#f8fafc' }}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Bar name="Crianças" dataKey="value" fill="#10b981" radius={[4, 4, 0, 0]} barSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {/* Ranking List Card */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <MapPin className="h-5 w-5 text-orange-600" />
              Detalhamento Geográfico (Ranking)
            </CardTitle>
            <CardDescription>Métricas completas por bairro filtrado</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar p-1">
              {stats.byBairro.map((bairro, idx) => (
                <div key={bairro.name} className="p-4 rounded-2xl border border-slate-100 bg-white hover:border-blue-200 hover:shadow-md transition-all group">
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex flex-col">
                      <span className="font-black text-sm text-slate-800 line-clamp-1">{bairro.name}</span>
                      <span className="text-[10px] text-slate-400 font-medium">Concentração de dados</span>
                    </div>
                    <Badge className="bg-slate-100 text-slate-600 border-none text-[10px] font-bold">#{idx + 1}</Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col">
                      <span className="text-[9px] uppercase font-black text-slate-400">Total Filhos</span>
                      <span className="font-black text-emerald-600 text-xl">{bairro.totalChildren}</span>
                    </div>
                    <div className="flex flex-col border-l border-slate-50 pl-3">
                      <span className="text-[9px] uppercase font-black text-slate-400">Famílias</span>
                      <span className="font-black text-slate-700 text-xl">{bairro.totalFamilies}</span>
                    </div>
                  </div>
                  <div className="mt-4 pt-4 border-t border-slate-50 flex items-center justify-between">
                    <div className="flex -space-x-2">
                      <div className="h-6 w-6 rounded-full bg-pink-100 flex items-center justify-center border-2 border-white" title="Mães">
                        <span className="text-[9px] font-bold text-pink-600">{bairro.mothers}</span>
                      </div>
                      <div className="h-6 w-6 rounded-full bg-blue-100 flex items-center justify-center border-2 border-white" title="Pais">
                        <span className="text-[9px] font-bold text-blue-600">{bairro.fathers}</span>
                      </div>
                      <div className="h-6 w-6 rounded-full bg-slate-100 flex items-center justify-center border-2 border-white" title="Outros">
                        <span className="text-[9px] font-bold text-slate-600">{bairro.othersProfile}</span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <div className="flex items-center gap-1">
                        <div className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                        <span className="text-[10px] font-bold text-slate-600">{bairro.boys}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="h-1.5 w-1.5 rounded-full bg-pink-500" />
                        <span className="text-[10px] font-bold text-slate-600">{bairro.girls}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #f1f5f9;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #94a3b8;
        }
      `}</style>
    </div>
  );
}
